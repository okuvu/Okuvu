import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { entryById } from '@okuvu/shared-types/worksheets';
import { router, therapistMutation, therapistProcedure } from '../trpc';

const MAX_SET_NAME_LENGTH = 80;
const MAX_SET_ITEMS = 20;

/**
 * Saved sets of exercises ("My anxiety starter set").
 *
 * Scoped to `therapist_id` everywhere — list, create, delete and the assign path
 * in homework.ts. A set is a therapist's own shortcut, so no colleague sees it
 * and no client id is involved: the same set can be assigned to anybody on the
 * therapist's roster.
 *
 * Every member is checked against the registry at save time. A set is written
 * once and used for months, which is exactly the shape that rots quietly after
 * an exercise is retired — so the check runs again at assign time rather than
 * being trusted from here.
 */
export const exerciseSetsRouter = router({
  list: therapistProcedure.query(async ({ ctx }) => {
    const sets = await ctx.db.exerciseSet.findMany({
      where: { therapist_id: ctx.therapistId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        name: true,
        created_at: true,
        items: {
          orderBy: [{ sort_order: 'asc' }, { tool_id: 'asc' }],
          select: {
            tool_id: true,
            sort_order: true,
            tool: { select: { label: true, status: true, est_minutes: true } },
          },
        },
      },
    });

    return sets.map((set) => ({
      id: set.id,
      name: set.name,
      createdAt: set.created_at.toISOString(),
      exercises: set.items.map((item) => ({
        toolId: item.tool_id,
        label: item.tool.label,
        estMinutes: item.tool.est_minutes,
        // A retired member is shown as such rather than hidden: a set that
        // silently lost an exercise is worse than one that says it needs editing.
        available: item.tool.status === 'approved',
      })),
    }));
  }),

  create: therapistMutation
    .input(
      z.object({
        name: z.string().trim().min(1, 'Give the set a name.').max(MAX_SET_NAME_LENGTH),
        toolIds: z.array(z.string().min(1)).min(1, 'Pick at least one exercise.').max(MAX_SET_ITEMS),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const therapistId = ctx.therapistId;

      const toolIds = [...new Set(input.toolIds)];

      const tools = await db.toolRegistryEntry.findMany({
        where: { tool_id: { in: toolIds } },
        select: { tool_id: true, label: true, status: true, kind: true },
      });
      const byId = new Map(tools.map((tool) => [tool.tool_id, tool]));

      for (const toolId of toolIds) {
        const tool = byId.get(toolId);
        const catalogueEntry = entryById(toolId);
        if (
          !tool ||
          tool.status !== 'approved' ||
          tool.kind === 'placeholder' ||
          catalogueEntry?.status === 'placeholder'
        ) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `"${tool?.label ?? toolId}" is not approved, so it cannot go in a set.`,
          });
        }
      }

      const set = await db.exerciseSet.create({
        data: {
          therapist_id: therapistId,
          name: input.name,
          items: {
            create: toolIds.map((toolId, index) => ({ tool_id: toolId, sort_order: index })),
          },
        },
        select: { id: true, name: true },
      });

      return set;
    }),

  remove: therapistMutation
    .input(z.object({ setId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      // deleteMany rather than delete: the where carries the ownership check, so
      // another therapist's set matches nothing and is not deleted.
      const deleted = await ctx.db.exerciseSet.deleteMany({
        where: { id: input.setId, therapist_id: ctx.therapistId },
      });

      if (deleted.count === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Set not found' });
      }

      return { deleted: true };
    }),
});
