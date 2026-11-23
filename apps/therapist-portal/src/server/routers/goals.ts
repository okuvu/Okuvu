import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { assertClientAssigned, router, therapistMutation, therapistProcedure } from '../trpc';

const MAX_GOAL_LENGTH = 300;

/**
 * Working goals, written by the therapist and worked through in their own order.
 *
 * A goal is a row rather than part of the Clinical Reasoning note because the
 * note is one free-text blob with nothing to point at: an assignment needs one
 * short, stable thing, and a list needs a sequence. `position` is that sequence
 * — the lowest-position *active* goal is the one the pair is working on now, and
 * the rest wait their turn. Marking a goal achieved (or dropping it) takes it
 * out of the queue without touching the order of the others, so the next goal
 * becomes the focus by itself.
 *
 * `Homework.therapy_goal` copies the text at assign time so an assignment keeps
 * its meaning after the goal is reworded. The client's surfaces do not read
 * that column, and nothing here assumes the goal list stays therapist-only:
 * the goals page says where the wording can end up.
 */
export const goalsRouter = router({
  list: therapistProcedure
    .input(z.object({ clientId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await assertClientAssigned(ctx.db, ctx.therapistId, input.clientId);

      const goals = await ctx.db.clientGoal.findMany({
        where: { therapist_id: ctx.therapistId, client_user_id: input.clientId },
        orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
        select: { id: true, text: true, status: true, position: true, created_at: true },
      });

      const focus = goals.find((goal) => goal.status === 'active') ?? null;

      return {
        goals: goals.map((goal) => ({
          id: goal.id,
          text: goal.text,
          status: goal.status,
          position: goal.position,
          createdAt: goal.created_at.toISOString(),
        })),
        // Which goal the pair is on now. Null when every goal is achieved or
        // dropped — the page asks for the next one rather than inventing a
        // focus.
        focusGoalId: focus?.id ?? null,
        activeCount: goals.filter((goal) => goal.status === 'active').length,
      };
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

      // New goals go to the back of the queue; a goal that belongs earlier is
      // moved into place afterwards, which keeps "add" cheap and leaves every
      // existing position untouched.
      const last = await ctx.db.clientGoal.aggregate({
        where: { therapist_id: ctx.therapistId, client_user_id: input.clientUserId },
        _max: { position: true },
      });
      const position = (last._max.position ?? -1) + 1;

      const goal = await ctx.db.clientGoal.create({
        data: {
          therapist_id: ctx.therapistId,
          client_user_id: input.clientUserId,
          text: input.text,
          position,
        },
        select: { id: true, text: true, status: true, position: true },
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

  /**
   * Move a goal within the therapist's order — up one, down one, or straight to
   * the top, which is how "this is the one we work on now" is said.
   *
   * The whole list is renumbered 0..n-1 rather than two rows swapping: every
   * goal written before the order column existed carries position 0, so two
   * rows can tie and a swap would move nothing.
   */
  move: therapistMutation
    .input(
      z.object({
        goalId: z.string().min(1),
        clientId: z.string().min(1),
        direction: z.enum(['up', 'down', 'top']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertClientAssigned(ctx.db, ctx.therapistId, input.clientId);

      const goals = await ctx.db.clientGoal.findMany({
        where: { therapist_id: ctx.therapistId, client_user_id: input.clientId },
        orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
        select: { id: true },
      });

      const index = goals.findIndex((goal) => goal.id === input.goalId);
      if (index === -1) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Goal not found' });
      }

      const target =
        input.direction === 'top' ? 0 : input.direction === 'up' ? index - 1 : index + 1;

      // Already at the edge: answer without writing, so a double tap does not
      // renumber the list for nothing.
      if (target < 0 || target >= goals.length || target === index) {
        return { moved: false, position: index };
      }

      const reordered = [...goals];
      const [moved] = reordered.splice(index, 1);
      reordered.splice(target, 0, moved);

      await ctx.db.$transaction(
        reordered.map((goal, position) =>
          ctx.db.clientGoal.updateMany({
            where: {
              id: goal.id,
              therapist_id: ctx.therapistId,
              client_user_id: input.clientId,
            },
            data: { position },
          }),
        ),
      );

      return { moved: true, position: target };
    }),
});
