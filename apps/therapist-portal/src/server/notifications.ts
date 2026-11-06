import type { PrismaClient } from '@okuvu/prisma';
import {
  buildAppointmentBookedNotification,
  buildAppointmentCancelledNotification,
  buildAppointmentRescheduledNotification,
  buildHomeworkNotification,
  buildReminderNotification,
  type NotificationDraft,
} from '@okuvu/shared-types';

/**
 * Writes the client-facing notification rows for therapist actions.
 *
 * This is the SENDER half of the inbox: without it the portal's homework,
 * reminder and appointment mutations finish and the client is told nothing —
 * which is exactly the gap this closes. The app reads the rows through
 * `GET /users/me/notifications`.
 *
 * Two deliberate properties:
 *
 * 1. **Non-throwing.** A failure here must not fail the therapist's action. The
 *    homework row or appointment is the record of care; losing it because a
 *    notification insert failed would be worse than a client missing one bell
 *    entry, and a thrown error would also leave the therapist re-submitting a
 *    form whose row already exists. Failures are logged loudly instead.
 * 2. **Not a webhook.** The portal writes these through the same Prisma client
 *    and the same request as the thing being announced. An HTTP hop between two
 *    apps would introduce a half-failed state nothing watches.
 *
 * Delivery note: writing the row is not delivery. Nothing pushes yet — the
 * client sees it when the app opens and asks. Push, when it lands, is another
 * sender reading the same rows.
 */

type NotificationDb = Pick<PrismaClient, 'notification' | 'user'>;

/** Kinds governed by Settings → Notifications → Appointment reminders. */
const APPOINTMENT_KINDS = new Set([
  'appointment_booked',
  'appointment_rescheduled',
  'appointment_cancelled',
]);

async function userAllowsKind(db: NotificationDb, userId: string, kind: string): Promise<boolean> {
  if (!APPOINTMENT_KINDS.has(kind)) return true;

  // The toggle has existed since v2.0 but nothing read it. It gates here, at
  // write time, so a client who switched appointment reminders off does not
  // get appointment rows in the inbox either — otherwise the switch is a
  // decoration that quietly does nothing, which is how it was reported as
  // broken in the first place.
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { appointment_reminders_enabled: true },
  });

  // No row means nothing to notify; the caller's own assertion should have
  // caught that, so treat it as "do not write" rather than "write anyway".
  return user?.appointment_reminders_enabled ?? false;
}

async function write(db: NotificationDb, userId: string, draft: NotificationDraft): Promise<void> {
  try {
    if (!(await userAllowsKind(db, userId, draft.kind))) return;

    await db.notification.create({
      data: {
        user_id: userId,
        kind: draft.kind,
        title: draft.title,
        body: draft.body,
        homework_id: draft.homeworkId ?? null,
        appointment_id: draft.appointmentId ?? null,
      },
    });
  } catch (err) {
    console.error(
      `[NOTIFY] could not record a ${draft.kind} notification for user ${userId}`,
      err,
    );
  }
}

export async function notifyHomeworkAssigned(
  db: NotificationDb,
  input: { clientUserId: string; homeworkId: string; description: string },
): Promise<void> {
  await write(
    db,
    input.clientUserId,
    buildHomeworkNotification({
      homeworkId: input.homeworkId,
      description: input.description,
    }),
  );
}

export async function notifyReminderSet(
  db: NotificationDb,
  input: {
    clientUserId: string;
    scheduleNote: string;
    frequency: string;
    times: readonly string[];
    homeworkId?: string | null;
  },
): Promise<void> {
  await write(
    db,
    input.clientUserId,
    buildReminderNotification({
      scheduleNote: input.scheduleNote,
      frequency: input.frequency,
      times: input.times,
      homeworkId: input.homeworkId ?? null,
    }),
  );
}

export async function notifyAppointmentBooked(
  db: NotificationDb,
  input: { clientUserId: string; appointmentId: string; scheduledAt: Date; additionalSessions?: number },
): Promise<void> {
  await write(
    db,
    input.clientUserId,
    buildAppointmentBookedNotification({
      appointmentId: input.appointmentId,
      scheduledAt: input.scheduledAt,
      additionalSessions: input.additionalSessions ?? 0,
    }),
  );
}

export async function notifyAppointmentRescheduled(
  db: NotificationDb,
  input: { clientUserId: string; appointmentId: string; scheduledAt: Date },
): Promise<void> {
  await write(
    db,
    input.clientUserId,
    buildAppointmentRescheduledNotification({
      appointmentId: input.appointmentId,
      scheduledAt: input.scheduledAt,
    }),
  );
}

export async function notifyAppointmentCancelled(
  db: NotificationDb,
  input: { clientUserId: string; appointmentId: string; scheduledAt: Date },
): Promise<void> {
  await write(
    db,
    input.clientUserId,
    buildAppointmentCancelledNotification({
      appointmentId: input.appointmentId,
      scheduledAt: input.scheduledAt,
    }),
  );
}
