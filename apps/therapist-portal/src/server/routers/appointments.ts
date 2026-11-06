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
import {
  notifyAppointmentBooked,
  notifyAppointmentCancelled,
  notifyAppointmentRescheduled,
} from '../notifications';

const MODES = ['video', 'phone', 'in_person'] as const;

const APPOINTMENT_FIELDS = z.object({
  clientUserId: z.string().min(1),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().positive().default(50),
  mode: z.enum(MODES),
  location: z.string().trim().optional(),
  noteToClient: z.string().trim().optional(),
  remind24h: z.boolean().default(false),
  remind1h: z.boolean().default(false),
});

function toView(a: {
  id: string;
  therapist_id: string;
  client_user_id: string;
  scheduled_at: Date;
  duration_minutes: number;
  mode: string;
  location: string | null;
  note_to_client: string | null;
  remind_24h: boolean;
  remind_1h: boolean;
  rescheduled_from: string | null;
  cancelled_at: Date | null;
}) {
  return {
    id: a.id,
    therapistId: a.therapist_id,
    clientUserId: a.client_user_id,
    scheduledAt: a.scheduled_at.toISOString(),
    durationMinutes: a.duration_minutes,
    mode: a.mode,
    location: a.location,
    noteToClient: a.note_to_client,
    remind24h: a.remind_24h,
    remind1h: a.remind_1h,
    rescheduledFrom: a.rescheduled_from,
    cancelledAt: a.cancelled_at?.toISOString() ?? null,
  };
}

export const appointmentsRouter = router({
  // wireframes P-01 — Schedule tab/page: day/week view across all of this
  // therapist's clients. Not per-client, so no assertClientAssigned check
  // — scoped to ctx.therapistId directly.
  listForTherapist: therapistProcedure
    .input(z.object({ from: z.string().datetime(), to: z.string().datetime() }))
    .query(async ({ ctx, input }) => {
      if (isBypassEnabled()) return [];

      const db = ctx.db;
      const appointments = await db.appointment.findMany({
        where: {
          therapist_id: ctx.therapistId,
          scheduled_at: { gte: new Date(input.from), lte: new Date(input.to) },
          cancelled_at: null,
        },
        orderBy: { scheduled_at: 'asc' },
        include: { client: { select: { phone_number: true } } },
      });

      return appointments.map((a) => ({ ...toView(a), clientPhoneNumber: a.client.phone_number }));
    }),

  // wireframes P-02/P-04 — client-detail "Next session" card + past/
  // upcoming list.
  listForClient: therapistProcedure
    .input(z.object({ clientUserId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      if (isBypassEnabled()) return { upcoming: [], past: [] };

      const db = ctx.db;
      const therapistId = ctx.therapistId;

      await assertClientAssigned(db, therapistId, input.clientUserId);

      const now = new Date();
      const [upcoming, past] = await Promise.all([
        db.appointment.findMany({
          where: { therapist_id: therapistId, client_user_id: input.clientUserId, scheduled_at: { gte: now }, cancelled_at: null },
          orderBy: { scheduled_at: 'asc' },
        }),
        db.appointment.findMany({
          where: {
            therapist_id: therapistId,
            client_user_id: input.clientUserId,
            OR: [{ scheduled_at: { lt: now } }, { cancelled_at: { not: null } }],
          },
          orderBy: { scheduled_at: 'desc' },
          take: 20,
        }),
      ]);

      return { upcoming: upcoming.map(toView), past: past.map(toView) };
    }),

  // wireframes P-03 — "repeat weekly (×N)" materializes N independent
  // rows at creation time, not a recurrence-rule field.
  create: therapistMutation
    .input(APPOINTMENT_FIELDS.extend({ repeatWeeklyCount: z.number().int().min(1).max(52).default(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const therapistId = ctx.therapistId;

      await assertClientAssigned(db, therapistId, input.clientUserId);
      await logClinicalAccess(db, therapistId, input.clientUserId, 'CREATE_APPOINTMENT');

      const baseDate = new Date(input.scheduledAt);
      const rows = Array.from({ length: input.repeatWeeklyCount }, (_, i) => {
        const scheduledAt = new Date(baseDate);
        scheduledAt.setDate(scheduledAt.getDate() + i * 7);
        return {
          therapist_id: therapistId,
          client_user_id: input.clientUserId,
          scheduled_at: scheduledAt,
          duration_minutes: input.durationMinutes,
          mode: input.mode,
          location: input.location ?? null,
          note_to_client: input.noteToClient ?? null,
          remind_24h: input.remind24h,
          remind_1h: input.remind1h,
        };
      });

      // One create per row rather than createMany: the notification row needs
      // the appointment id to deep-link to, and createMany returns none.
      // Bounded by repeatWeeklyCount (<= 52), so the extra round-trips are
      // acceptable at this volume.
      const created: Array<{ id: string; scheduled_at: Date }> = [];
      for (const row of rows) {
        created.push(
          await db.appointment.create({
            data: row,
            select: { id: true, scheduled_at: true },
          }),
        );
      }

      // A repeat booking is one announcement, not N: a client who books eight
      // weekly sessions should not find eight identical rows in the inbox.
      if (created.length > 0) {
        await notifyAppointmentBooked(db, {
          clientUserId: input.clientUserId,
          appointmentId: created[0]!.id,
          scheduledAt: created[0]!.scheduled_at,
          additionalSessions: created.length - 1,
        });
      }

      return { success: true, count: rows.length };
    }),

  // wireframes P-04 — "reschedule keeps rescheduled_from": creates a new
  // row pointing back at the old one, and marks the old row cancelled
  // (superseded, never deleted).
  reschedule: therapistMutation
    .input(APPOINTMENT_FIELDS.extend({ appointmentId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const therapistId = ctx.therapistId;

      await assertClientAssigned(db, therapistId, input.clientUserId);

      const existing = await db.appointment.findUnique({
        where: { id: input.appointmentId },
        select: { therapist_id: true, client_user_id: true },
      });
      if (!existing || existing.therapist_id !== therapistId || existing.client_user_id !== input.clientUserId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Appointment not found' });
      }

      await logClinicalAccess(db, therapistId, input.clientUserId, 'RESCHEDULE_APPOINTMENT');

      const [, created] = await db.$transaction([
        db.appointment.update({
          where: { id: input.appointmentId },
          data: { cancelled_at: new Date() },
        }),
        db.appointment.create({
          data: {
            therapist_id: therapistId,
            client_user_id: input.clientUserId,
            scheduled_at: new Date(input.scheduledAt),
            duration_minutes: input.durationMinutes,
            mode: input.mode,
            location: input.location ?? null,
            note_to_client: input.noteToClient ?? null,
            remind_24h: input.remind24h,
            remind_1h: input.remind1h,
            rescheduled_from: input.appointmentId,
          },
        }),
      ]);

      await notifyAppointmentRescheduled(db, {
        clientUserId: input.clientUserId,
        appointmentId: created.id,
        scheduledAt: created.scheduled_at,
      });

      return toView(created);
    }),

  // wireframes P-04 — "cancel sets cancelled_at; never deletes."
  cancel: therapistMutation
    .input(z.object({ appointmentId: z.string().min(1), clientUserId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const therapistId = ctx.therapistId;

      await assertClientAssigned(db, therapistId, input.clientUserId);

      const existing = await db.appointment.findUnique({
        where: { id: input.appointmentId },
        select: { therapist_id: true, client_user_id: true, scheduled_at: true },
      });
      if (!existing || existing.therapist_id !== therapistId || existing.client_user_id !== input.clientUserId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Appointment not found' });
      }

      await logClinicalAccess(db, therapistId, input.clientUserId, 'CANCEL_APPOINTMENT');

      await db.appointment.update({
        where: { id: input.appointmentId },
        data: { cancelled_at: new Date() },
      });

      await notifyAppointmentCancelled(db, {
        clientUserId: input.clientUserId,
        appointmentId: input.appointmentId,
        scheduledAt: existing.scheduled_at,
      });

      return { success: true };
    }),
});
