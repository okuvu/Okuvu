import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { assertClientAssigned, router, therapistMutation, therapistProcedure } from '../trpc';

/**
 * The exposure ladder, built by the therapist with the client in session.
 *
 * This is the writer the client read guard depends on: without it the client
 * would see an empty ladder forever and no one could create a step. It is also
 * the only place a step is unlocked, which is what makes "the client sees only
 * the steps the therapist unlocks" true rather than a UI convention.
 *
 * Steps belong to the client's record, not to the therapist who typed them: any
 * therapist currently assigned to that client can build the ladder, and an
 * unassigned therapist is refused by `assertClientAssigned`. `difficulty` is the
 * therapist's 0-100 rating of the step; it is never shown to the client, whose
 * own ratings live on the runs.
 */

const MAX_LABEL = 200;

const ladderSelect = {
  id: true,
  label: true,
  difficulty: true,
  position: true,
  unlocked_at: true,
  created_at: true,
  runs: {
    orderBy: { created_at: 'desc' as const },
    take: 1,
    select: { before: true, after: true, created_at: true },
  },
} as const;

export const exposureRouter = router({
  list: therapistProcedure
    .input(z.object({ clientId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await assertClientAssigned(ctx.db, ctx.therapistId, input.clientId);

      const steps = await ctx.db.exposureStep.findMany({
        where: { client_user_id: input.clientId },
        orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
        select: ladderSelect,
      });

      return {
        steps: steps.map((step) => ({
          id: step.id,
          label: step.label,
          difficulty: step.difficulty,
          position: step.position,
          unlocked: step.unlocked_at !== null,
          lastRun: step.runs[0]
            ? {
                before: step.runs[0].before,
                after: step.runs[0].after,
                createdAt: step.runs[0].created_at.toISOString(),
              }
            : null,
        })),
        // A step that has never been written is a real state, and the page asks
        // for one rather than inventing a ladder.
        unlockedCount: steps.filter((step) => step.unlocked_at !== null).length,
      };
    }),

  add: therapistMutation
    .input(
      z.object({
        clientUserId: z.string().min(1),
        label: z.string().trim().min(1, 'Write the step.').max(MAX_LABEL),
        difficulty: z.number().int().min(0).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertClientAssigned(ctx.db, ctx.therapistId, input.clientUserId);

      const last = await ctx.db.exposureStep.aggregate({
        where: { client_user_id: input.clientUserId },
        _max: { position: true },
      });

      const step = await ctx.db.exposureStep.create({
        data: {
          client_user_id: input.clientUserId,
          label: input.label,
          difficulty: input.difficulty,
          position: (last._max.position ?? -1) + 1,
        },
        select: { id: true, position: true },
      });

      return { id: step.id, position: step.position };
    }),

  update: therapistMutation
    .input(
      z.object({
        stepId: z.string().min(1),
        label: z.string().trim().min(1).max(MAX_LABEL).optional(),
        difficulty: z.number().int().min(0).max(100).optional(),
        position: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const step = await ctx.db.exposureStep.findUnique({
        where: { id: input.stepId },
        select: { id: true, client_user_id: true },
      });
      if (!step) throw new TRPCError({ code: 'NOT_FOUND', message: 'Step not found' });
      await assertClientAssigned(ctx.db, ctx.therapistId, step.client_user_id);

      await ctx.db.exposureStep.update({
        where: { id: step.id },
        data: {
          ...(input.label === undefined ? {} : { label: input.label }),
          ...(input.difficulty === undefined ? {} : { difficulty: input.difficulty }),
          ...(input.position === undefined ? {} : { position: input.position }),
        },
      });

      return { ok: true };
    }),

  /**
   * Unlock or lock one step.
   *
   * Unlocking is the moment the step becomes visible to the client; locking it
   * again hides it. A client's existing ratings are kept either way, so
   * re-unlocking does not erase what they already reported.
   */
  setUnlocked: therapistMutation
    .input(z.object({ stepId: z.string().min(1), unlocked: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const step = await ctx.db.exposureStep.findUnique({
        where: { id: input.stepId },
        select: { id: true, client_user_id: true },
      });
      if (!step) throw new TRPCError({ code: 'NOT_FOUND', message: 'Step not found' });
      await assertClientAssigned(ctx.db, ctx.therapistId, step.client_user_id);

      await ctx.db.exposureStep.update({
        where: { id: step.id },
        data: { unlocked_at: input.unlocked ? new Date() : null },
      });

      return { id: step.id, unlocked: input.unlocked };
    }),

  remove: therapistMutation
    .input(z.object({ stepId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const step = await ctx.db.exposureStep.findUnique({
        where: { id: input.stepId },
        select: { id: true, client_user_id: true },
      });
      if (!step) throw new TRPCError({ code: 'NOT_FOUND', message: 'Step not found' });
      await assertClientAssigned(ctx.db, ctx.therapistId, step.client_user_id);

      // The runs cascade with the step: a rating of a step the therapist deleted
      // has nothing left to describe.
      await ctx.db.exposureStep.delete({ where: { id: step.id } });

      return { deleted: true };
    }),
});
