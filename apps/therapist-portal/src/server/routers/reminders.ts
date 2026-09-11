import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  assertClientAssigned,
  isBypassEnabled,
  logClinicalAccess,
  router,
  therapistMutation,
  therapistProcedure,
} from '../trpc';

const FREQUENCIES = ['off', 'once_daily', 'twice_daily', 'thrice_daily', 'as_needed'] as const;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const remindersRouter = router({
  listReminders: therapistProcedure
    .input(z.object({ clientId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      if (isBypassEnabled()) {
        return [];
      }

      const db = ctx.db;
      const therapistId = ctx.therapistId;

      await assertClientAssigned(db, therapistId, input.clientId);
      await logClinicalAccess(db, therapistId, input.clientId, 'VIEW_REMINDERS');

      const reminders = await db.reminder.findMany({
        where: { user_id: input.clientId },
        orderBy: { created_at: 'desc' },
        include: { tool: { select: { tool_id: true, label: true } } },
      });

      return reminders.map((r) => ({
        id: r.id,
        scheduleNote: r.schedule_note,
        frequency: r.frequency,
        times: r.times,
        active: r.active,
        homeworkId: r.homework_id,
        tool: r.tool ? { toolId: r.tool.tool_id, label: r.tool.label } : null,
        createdAt: r.created_at.toISOString(),
      }));
    }),

  // Static reference data (the shared ToolRegistryEntry table) — no
  // per-client gating needed, but still therapist-only.
  listTools: therapistProcedure.query(async ({ ctx }) => {
    const db = ctx.db;
    const tools = await db.toolRegistryEntry.findMany({ orderBy: { label: 'asc' } });
    return tools.map((t) => ({ toolId: t.tool_id, label: t.label, chatGuidable: t.chat_guidable }));
  }),

  create: therapistMutation
    .input(
      z.object({
        clientUserId: z.string().min(1),
        scheduleNote: z.string().trim().min(1, 'Reminder text must not be empty'),
        frequency: z.enum(FREQUENCIES),
        times: z.array(z.string().regex(TIME_PATTERN, 'times must be "HH:mm"')).max(3),
        homeworkId: z.string().optional(),
        toolId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const therapistId = ctx.therapistId;

      await assertClientAssigned(db, therapistId, input.clientUserId);
      await logClinicalAccess(db, therapistId, input.clientUserId, 'CREATE_REMINDER');

      const reminder = await db.reminder.create({
        data: {
          user_id: input.clientUserId,
          schedule_note: input.scheduleNote,
          frequency: input.frequency,
          times: input.times,
          homework_id: input.homeworkId ?? null,
          tool_id: input.toolId ?? null,
        },
        select: { id: true, active: true, created_at: true },
      });

      return reminder;
    }),

  setActive: therapistMutation
    .input(
      z.object({
        id: z.string(),
        clientUserId: z.string().min(1),
        active: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const therapistId = ctx.therapistId;

      await assertClientAssigned(db, therapistId, input.clientUserId);

      const existing = await db.reminder.findUnique({
        where: { id: input.id },
        select: { user_id: true },
      });
      if (!existing || existing.user_id !== input.clientUserId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Reminder not found' });
      }

      const reminder = await db.reminder.update({
        where: { id: input.id },
        data: { active: input.active },
        select: { id: true, active: true },
      });

      return reminder;
    }),
});
