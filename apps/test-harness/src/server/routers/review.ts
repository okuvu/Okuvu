import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../trpc';
import { computeCohenKappa } from '@/lib/kappa';

/**
 * Blind review router (TH-S23).
 *
 * Data-model note on `BlindedReviewItem.rubric_scores` vs `ReviewRating.scores`:
 * `rubric_scores` on `BlindedReviewItem` reads as a canonical/reference scoring
 * for the item (e.g. an expected or gold-standard scoring set by whoever seeded
 * the review batch), whereas each individual rater's own judgement is recorded
 * as their own `ReviewRating` row (one per rater per item, enforced by the
 * `@@unique([item_id, rater_id])` constraint). `getBlindedItems` therefore never
 * returns `rubric_scores` to raters — surfacing the reference/expected answer
 * would defeat the purpose of a *blinded* review. Only `id` and `output` are
 * selected.
 */

function assertRaterOrPI(role: string) {
  if (role !== 'RATER' && role !== 'PI') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Only RATER or PI may access review items.' });
  }
}

/**
 * Deterministic per-rater shuffle: hash `raterId + itemId` with a small
 * string hash (FNV-1a) and sort items by that hash. This gives each rater a
 * stable pseudo-random ordering across page loads (no re-shuffle on every
 * call) while different raters see different orders, which avoids raters
 * anchoring on a shared "item #1" effect.
 */
function fnv1aHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export const reviewRouter = router({
  /**
   * Returns blinded review items for the current rater: only `{ id, output }`
   * is selected — `run_id`, `rater_id`, `unblinded_at`, and `rubric_scores`
   * are never fetched, so they cannot leak even by accident. Items the
   * current rater has already submitted a rating for are excluded (a rater
   * reviews each item exactly once). Order is a deterministic per-rater
   * shuffle so the same rater sees a stable order across page loads, but
   * different raters see different orders.
   */
  getBlindedItems: protectedProcedure
    .input(z.object({ limit: z.number().int().positive().max(500).optional() }).optional())
    .query(async ({ ctx, input }) => {
      assertRaterOrPI(ctx.user.role);
      if (!ctx.prisma) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured.' });
      }

      const alreadyRated = await ctx.prisma.reviewRating.findMany({
        where: { rater_id: ctx.user.id },
        select: { item_id: true },
      });
      const ratedIds = alreadyRated.map((r) => r.item_id);

      const items = await ctx.prisma.blindedReviewItem.findMany({
        where: ratedIds.length > 0 ? { id: { notIn: ratedIds } } : undefined,
        select: { id: true, output: true },
      });

      const shuffled = [...items].sort(
        (a, b) => fnv1aHash(ctx.user.id + a.id) - fnv1aHash(ctx.user.id + b.id),
      );

      const limit = input?.limit;
      return limit ? shuffled.slice(0, limit) : shuffled;
    }),

  /**
   * Records (or updates) the current rater's scores for one blinded item.
   * Upserts on the (item_id, rater_id) compound unique key so a rater
   * re-submitting the same item overwrites their prior rating rather than
   * erroring or duplicating.
   */
  submitRating: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        scores: z.record(z.string(), z.number()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertRaterOrPI(ctx.user.role);
      if (!ctx.prisma) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured.' });
      }

      return ctx.prisma.reviewRating.upsert({
        where: {
          item_id_rater_id: {
            item_id: input.itemId,
            rater_id: ctx.user.id,
          },
        },
        create: {
          item_id: input.itemId,
          rater_id: ctx.user.id,
          scores: input.scores,
        },
        update: {
          scores: input.scores,
        },
      });
    }),

  /**
   * Computes Cohen's κ inter-rater agreement between every pair of raters
   * who both rated at least one common item (optionally restricted to
   * `itemIds`). Each rating's `scores` (a Record<string, number> of rubric
   * dimensions) is reduced to a single categorical label for κ purposes by
   * averaging the numeric values across dimensions and bucketing to a fixed
   * precision (2 decimal places) — a pragmatic v1 approach documented here
   * rather than picking one arbitrary dimension key, since rubrics may vary
   * which keys are present per item.
   */
  computeKappa: protectedProcedure
    .input(z.object({ itemIds: z.array(z.string()).optional() }).optional())
    .query(async ({ ctx, input }) => {
      assertRaterOrPI(ctx.user.role);
      if (!ctx.prisma) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured.' });
      }

      const ratings = await ctx.prisma.reviewRating.findMany({
        where: input?.itemIds ? { item_id: { in: input.itemIds } } : undefined,
        select: { item_id: true, rater_id: true, scores: true },
      });

      // Group ratings by item_id -> rater_id -> categorical label.
      const byItem = new Map<string, Map<string, string>>();
      for (const r of ratings) {
        const scores = r.scores as Record<string, number> | null;
        const values = scores ? Object.values(scores) : [];
        const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        const label = avg.toFixed(2);

        if (!byItem.has(r.item_id)) byItem.set(r.item_id, new Map());
        byItem.get(r.item_id)!.set(r.rater_id, label);
      }

      // Collect every distinct pair of raters and the items they both rated.
      const raterIds = new Set<string>();
      for (const perRater of byItem.values()) {
        for (const raterId of perRater.keys()) raterIds.add(raterId);
      }
      const raterList = [...raterIds].sort();

      const raterPairs: { rater1: string; rater2: string; kappa: number; n: number }[] = [];

      for (let i = 0; i < raterList.length; i++) {
        for (let j = i + 1; j < raterList.length; j++) {
          const rater1 = raterList[i];
          const rater2 = raterList[j];
          const labels1: string[] = [];
          const labels2: string[] = [];

          for (const perRater of byItem.values()) {
            if (perRater.has(rater1) && perRater.has(rater2)) {
              labels1.push(perRater.get(rater1)!);
              labels2.push(perRater.get(rater2)!);
            }
          }

          if (labels1.length > 0) {
            raterPairs.push({
              rater1,
              rater2,
              kappa: computeCohenKappa(labels1, labels2),
              n: labels1.length,
            });
          }
        }
      }

      const overallKappa =
        raterPairs.length > 0
          ? raterPairs.reduce((sum, p) => sum + p.kappa * p.n, 0) /
            raterPairs.reduce((sum, p) => sum + p.n, 0)
          : undefined;

      return { raterPairs, overallKappa };
    }),

  /**
   * PI-only: unblinds a single review item, revealing its `run_id`. Sets
   * `unblinded_at` on the row. Audit-trail note: the current schema (as
   * handed off by the prior data-modeling story) has no dedicated
   * unblind-audit table or `signed_by` column on `BlindedReviewItem`, so v1
   * records the audit trail as (a) the `unblinded_at` timestamp itself and
   * (b) a server-side `console.log` line naming who unblinded which item and
   * when. A dedicated audit table (mirroring `GateSignOff`, which records
   * signer + timestamp for gate approvals) would be a good follow-up story
   * if a durable, queryable unblind audit log becomes a requirement.
   */
  unblindResults: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'PI') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only PI may unblind review results.' });
      }
      if (!ctx.prisma) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured.' });
      }

      const item = await ctx.prisma.blindedReviewItem.update({
        where: { id: input.itemId },
        data: { unblinded_at: new Date() },
      });

      console.log(
        `[review.unblindResults] item=${input.itemId} unblinded_by=${ctx.user.id} (${ctx.user.email}) at=${item.unblinded_at?.toISOString()}`,
      );

      return item;
    }),
});
