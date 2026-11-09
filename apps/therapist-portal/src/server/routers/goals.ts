import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { assertClientAssigned, router, therapistMutation, therapistProcedure } from '../trpc';

const MAX_GOAL_LENGTH = 300;

/**
 * Working goals, written by the therapist next to their Clinical Reasoning note.
 *
 * The clinical reasoning note is one free-text blob, so there is nothing in it to
 * point an assignment at. A goal is a row instead: short, stable, and listable in
 * a select. It is the therapist's own wording and it is never shown to a client —
 * `Homework.therapy_goal` copies the text so an assignment keeps its meaning, but
 * the client's surfaces do not read that column.
 */
export const goalsRouter = router({
  list: therapistProcedure
    .input(z.object({ clientId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await assertClientAssigned(ctx.db, ctx.therapistId, input.clientId);

      const goals = await ctx.db.clientGoal.findMany({
        where: { therapist_id: ctx.therapistId, client_user_id: input.clientId },
        orderBy: [{ status: 'asc' }, { created_at: 'asc' }],
        select: { id: true, text: true, status: true, created_at: true },
      });

      return goals.map((goal) => ({
        id: goal.id,
        text: goal.text,
        status: goal.status,
        createdAt: goal.created_at.toISOString(),
      }));
    }),

  add: therapistMutation
    .input(
      z.object({
        clientUserId: z.string().min(1),
        text: z.string().trim().min(1, 'Write the goal.').max(MAX_GOAL_LENGTH),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertClientAssigned(ctx.db, ctx.therapistId, input.clientUserId);

      const goal = await ctx.db.clientGoal.create({
        data: {
          therapist_id: ctx.therapistId,
          client_user_id: input.clientUserId,
          text: input.text,
        },
        select: { id: true, text: true, status: true },
      });

      return goal;
    }),

  setStatus: therapistMutation
    .input(
      z.object({
        goalId: z.string().min(1),
        clientId: z.string().min(1),
        status: z.enum(['active', 'achieved', 'dropped']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertClientAssigned(ctx.db, ctx.therapistId, input.clientId);

      // updateMany carries the ownership check in the where clause, so another
      // therapist's goal matches nothing.
      const updated = await ctx.db.clientGoal.updateMany({
        where: { id: input.goalId, therapist_id: ctx.therapistId, client_user_id: input.clientId },
        data: { status: input.status },
      });

      if (updated.count === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Goal not found' });
      }

      return { status: input.status };
    }),
});
