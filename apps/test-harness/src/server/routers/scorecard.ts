import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../trpc';
import { withEnvironment } from '../../lib/prisma-rls';
import { computeScorecard, diffScorecards, type ScorecardStats } from '../../lib/scorecard';

const environmentSchema = z.enum(['sandbox', 'staging', 'beta']);

async function fetchScorecardRuns(
  environment: 'sandbox' | 'staging' | 'beta',
  runIds: string[] | undefined,
) {
  return withEnvironment(environment, (tx) =>
    tx.testRun.findMany({
      where: runIds ? { id: { in: runIds } } : { environment },
      select: { id: true, status: true, canned: true, results: true },
      orderBy: { created_at: 'desc' },
      ...(runIds ? {} : { take: 500 }),
    }),
  );
}

export const scorecardRouter = router({
  /**
   * Aggregate scorecard (mvp-v2-engineering-spec.md §6.3) over either an
   * explicit set of runs (`runIds`) or the most recent 500 runs for an
   * environment. Best-effort across the heterogeneous `results` shapes each
   * router persists — see scorecard.ts's module doc comment.
   */
  getScorecard: protectedProcedure
    .input(
      z.object({
        environment: environmentSchema,
        runIds: z.array(z.string()).optional(),
      }),
    )
    .query(async ({ input }) => {
      const runs = await fetchScorecardRuns(input.environment, input.runIds);
      return computeScorecard(runs);
    }),

  /**
   * Pin a batch of TestRun ids as a named baseline (e.g. "gemini-pre-cutover")
   * for an environment. PI-only, append-only — pinning again under the same
   * label creates a new row rather than replacing the old one, so every past
   * baseline pin remains available (same convention as ModelConfigPin /
   * GateSignOff).
   */
  pinBaseline: protectedProcedure
    .input(
      z.object({
        environment: environmentSchema,
        label: z.string().min(1),
        runIds: z.array(z.string()).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'PI') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only PI role may pin a baseline' });
      }
      if (!ctx.user.email) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Pinning user has no email on record' });
      }

      return withEnvironment(input.environment, (tx) =>
        tx.baselineArchive.create({
          data: {
            environment: input.environment,
            label: input.label,
            run_ids: input.runIds,
            pinned_by: ctx.user.email as string,
          },
        }),
      );
    }),

  /** The most recent baseline pin for an environment + label, or null if none exists yet. */
  getLatestBaseline: protectedProcedure
    .input(z.object({ environment: environmentSchema, label: z.string().min(1) }))
    .query(async ({ input }) => {
      return withEnvironment(input.environment, (tx) =>
        tx.baselineArchive.findFirst({
          where: { environment: input.environment, label: input.label },
          orderBy: { pinned_at: 'desc' },
        }),
      );
    }),

  /**
   * Regression view (mvp-v2-engineering-spec.md §3 "Regression" row): compute
   * the scorecard for `currentRunIds` (or the most recent 500 runs for the
   * environment, when omitted) and diff it against the latest pinned
   * baseline's scorecard for the same environment + label.
   */
  compareToBaseline: protectedProcedure
    .input(
      z.object({
        environment: environmentSchema,
        label: z.string().min(1),
        currentRunIds: z.array(z.string()).optional(),
      }),
    )
    .query(async ({ input }) => {
      const baseline = await withEnvironment(input.environment, (tx) =>
        tx.baselineArchive.findFirst({
          where: { environment: input.environment, label: input.label },
          orderBy: { pinned_at: 'desc' },
        }),
      );
      if (!baseline) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `No baseline pinned for environment '${input.environment}', label '${input.label}'.`,
        });
      }

      const [currentRuns, baselineRuns] = await Promise.all([
        fetchScorecardRuns(input.environment, input.currentRunIds),
        fetchScorecardRuns(input.environment, baseline.run_ids),
      ]);

      const current: ScorecardStats = computeScorecard(currentRuns);
      const baselineStats: ScorecardStats = computeScorecard(baselineRuns);

      return {
        baseline: { id: baseline.id, label: baseline.label, pinnedAt: baseline.pinned_at, runCount: baseline.run_ids.length },
        current,
        baselineStats,
        delta: diffScorecards(current, baselineStats),
      };
    }),
});
