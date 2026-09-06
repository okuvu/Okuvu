import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../trpc';

/**
 * TH-S31 — Beta consent capture, `consent` router.
 *
 * Reuses the `BetaConsent` model already in schema.prisma (added ahead of
 * this story, per its own header comment: `{ id, corpus_case_id?, user_ref,
 * scope, consent_granted_at, expires_at? }`).
 *
 * Now registered in `server/routers/_app.ts` as `consent`, alongside every
 * other router built this sprint. `ConsentPanel.tsx` still calls it through
 * a local server-action caller (`apps/test-harness/src/app/corpus/_components/consent-actions.ts`,
 * mirroring `corpus/actions.ts`'s pattern) rather than the typed
 * `trpc.consent.*` react-query client — that's a leftover from before
 * central wiring landed and is a fine follow-up to simplify, not a bug.
 */

function requirePrisma<T>(prisma: T | null): T {
  if (!prisma) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Database not configured',
    });
  }
  return prisma;
}

export const consentRouter = router({
  /**
   * Records a consent grant. `corpusCaseId` is optional because consent may
   * be captured against a user reference generally (e.g. a beta
   * participant's overall opt-in) rather than tied to one specific corpus
   * case.
   */
  captureConsent: protectedProcedure
    .input(
      z.object({
        corpusCaseId: z.string().optional(),
        userRef: z.string().min(1),
        scope: z.string().min(1),
        expiresAt: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const prisma = requirePrisma(ctx.prisma);

      const created = await prisma.betaConsent.create({
        data: {
          corpus_case_id: input.corpusCaseId,
          user_ref: input.userRef,
          scope: input.scope,
          expires_at: input.expiresAt ? new Date(input.expiresAt) : undefined,
        },
      });

      return {
        id: created.id,
        corpusCaseId: created.corpus_case_id,
        userRef: created.user_ref,
        scope: created.scope,
        consentGrantedAt: created.consent_granted_at.toISOString(),
        expiresAt: created.expires_at?.toISOString(),
      };
    }),

  /**
   * Reports whether an *active* (granted, and either no expiry or an
   * expiry in the future) consent record exists for the given `userRef`
   * and/or `corpusCaseId`. At least one of the two must be supplied — a
   * call with neither would ambiguously ask "does any consent exist
   * anywhere", which isn't a meaningful status check.
   */
  getConsentStatus: protectedProcedure
    .input(
      z
        .object({
          userRef: z.string().min(1).optional(),
          corpusCaseId: z.string().optional(),
        })
        .refine((v) => !!v.userRef || !!v.corpusCaseId, {
          message: 'Provide at least one of userRef or corpusCaseId',
        }),
    )
    .query(async ({ ctx, input }) => {
      const prisma = requirePrisma(ctx.prisma);

      const where: Record<string, unknown> = {};
      if (input.userRef) where.user_ref = input.userRef;
      if (input.corpusCaseId) where.corpus_case_id = input.corpusCaseId;

      const records = await prisma.betaConsent.findMany({
        where,
        orderBy: { consent_granted_at: 'desc' },
      });

      const now = Date.now();
      const active = records.filter(
        (r) => !r.expires_at || r.expires_at.getTime() > now,
      );

      return {
        hasActiveConsent: active.length > 0,
        activeCount: active.length,
        mostRecent: records[0]
          ? {
              id: records[0].id,
              scope: records[0].scope,
              consentGrantedAt: records[0].consent_granted_at.toISOString(),
              expiresAt: records[0].expires_at?.toISOString(),
            }
          : null,
      };
    }),
});
