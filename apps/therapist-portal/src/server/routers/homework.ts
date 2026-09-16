import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  assertClientAssigned,
  logClinicalAccess,
  router,
  therapistMutation,
  therapistProcedure,
} from '../trpc';

const MAX_DESCRIPTION_LENGTH = 2000;

export const homeworkRouter = router({
  assign: therapistMutation
    .input(
      z.object({
        clientUserId: z.string().min(1),
        description: z.string().trim().min(1, 'Homework description must not be empty').max(MAX_DESCRIPTION_LENGTH),
        // Decisions doc round, 15 Sep 2026 §4/§5 — optional link to one of
        // the 5 approved exercises, so the client app can render this as a
        // real, playable exercise rather than just prose. Additive: existing
        // pure-text assignments (toolId omitted) keep working unchanged.
        toolId: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const therapistId = ctx.therapistId;

      await assertClientAssigned(db, therapistId, input.clientUserId);

      if (input.toolId) {
        const tool = await db.toolRegistryEntry.findUnique({
          where: { tool_id: input.toolId },
          select: { tool_id: true },
        });
        if (!tool) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Tool not found' });
        }
      }

      const homework = await db.homework.create({
        data: {
          therapist_id: therapistId,
          client_user_id: input.clientUserId,
          description: input.description,
          tool_id: input.toolId,
        },
        select: {
          id: true,
          status: true,
          assigned_at: true,
        },
      });

      return homework;
    }),

  listHomework: therapistProcedure
    .input(
      z.object({
        clientId: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db;
      const therapistId = ctx.therapistId;

      await assertClientAssigned(db, therapistId, input.clientId);
      await logClinicalAccess(db, therapistId, input.clientId, 'VIEW_HOMEWORK');

      const homework = await db.homework.findMany({
        where: {
          therapist_id: therapistId,
          client_user_id: input.clientId,
        },
        orderBy: {
          assigned_at: 'desc',
        },
        select: {
          id: true,
          description: true,
          status: true,
          assigned_at: true,
          updated_at: true,
          tool: { select: { tool_id: true, label: true } },
        },
      });

      return homework.map((h) => ({
        ...h,
        tool: h.tool ? { toolId: h.tool.tool_id, label: h.tool.label } : null,
      }));
    }),

  markCompleted: therapistMutation
    .input(
      z.object({
        homeworkId: z.string().min(1),
        clientId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const therapistId = ctx.therapistId;

      await assertClientAssigned(db, therapistId, input.clientId);

      // Defense in depth beyond assertClientAssigned: only the therapist who
      // assigned this specific homework row (and only for the client it was
      // actually assigned to) may mark it completed — mirrors the ownership
      // check notes.ts relies on implicitly via its therapist_id-scoped
      // findMany, made explicit here since this is an update by id.
      const existing = await db.homework.findUnique({
        where: { id: input.homeworkId },
        select: { therapist_id: true, client_user_id: true },
      });
      if (
        !existing ||
        existing.therapist_id !== therapistId ||
        existing.client_user_id !== input.clientId
      ) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Homework item not found' });
      }

      const homework = await db.homework.update({
        where: { id: input.homeworkId },
        data: { status: 'completed' },
        select: {
          id: true,
          status: true,
          updated_at: true,
        },
      });

      return homework;
    }),
});
