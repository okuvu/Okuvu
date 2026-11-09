import type { PrismaClient } from '@okuvu/prisma';
import {
  buildAppointmentBookedNotification,
  buildAppointmentCancelledNotification,
  buildAppointmentRescheduledNotification,
  buildHomeworkNotification,
  buildReminderNotification,
  type NotificationDraft,
} from '@okuvu/shared-types';
import { sendClientNotificationEmail } from '@/lib/email';

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
 * Delivery: the row is the record, and email is a sender hanging off it — the
 * client who does not open the app still finds out. Email is sent *after* the
 * row is committed and its failure is swallowed separately, so a Brevo outage
 * costs a missing message, never the row, and never the therapist's action.
 * Push, when it lands, is another sender reading the same rows.
 *
 * The email carries none of the row's text: see the disclosure note on
 * `sendClientNotificationEmail`. Inbox copy stays clinical; email does not.
 */

type NotificationDb = Pick<PrismaClient, 'notification' | 'user'>;

/** Kinds governed by Settings → Notifications → Appointment reminders. */
const APPOINTMENT_KINDS = new Set([
  'appointment_booked',
  'appointment_rescheduled',
  'appointment_cancelled',
]);

interface Recipient {
  email: string | null;
  appointment_reminders_enabled: boolean;
}

/**
 * One lookup answers both questions the write path needs: may this kind be sent
 * at all, and where does the email go. Two queries would let the answers
 * disagree mid-write.
 *
 * No row means there is nobody to notify; the caller's own assertion should have
 * caught that, so it is treated as "do not write" rather than "write anyway".
 */
async function loadRecipient(db: NotificationDb, userId: string): Promise<Recipient | null> {
  return db.user.findUnique({
    where: { id: userId },
    select: { email: true, appointment_reminders_enabled: true },
  });
}

async function write(
  db: NotificationDb,
  userId: string,
  draft: NotificationDraft,
  options: { scheduledAt?: Date } = {},
): Promise<void> {
  let recipient: Recipient | null;

  try {
    recipient = await loadRecipient(db, userId);
  } catch (err) {
    console.error(`[NOTIFY] could not load the recipient of a ${draft.kind} notification`, err);
    return;
  }

  if (!recipient) return;

  // The toggle gates here, at write time, so a client who switched appointment
  // reminders off does not get appointment rows in the inbox either — otherwise
  // the switch is a decoration that quietly does nothing, which is how it was
  // reported as broken in the first place. Because email hangs off the row,
  // this one gate covers both surfaces.
  if (APPOINTMENT_KINDS.has(draft.kind) && !recipient.appointment_reminders_enabled) return;

  try {
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
    return;
  }

  if (!recipient.email) {
    // Pre-wizard rows can have no address. The inbox row is still there, so the
    // client sees it when they open the app.
    console.warn(
      `[NOTIFY] ${draft.kind} recorded for user ${userId} but no email address is on file`,
    );
    return;
  }

  // Separate try: this must not be reported as a failure to record the row, and
  // the sender itself already resolves to {sent:false} rather than throwing.
  try {
    await sendClientNotificationEmail({
      to: recipient.email,
      kind: draft.kind,
      scheduledAt: options.scheduledAt ?? null,
    });
  } catch (err) {
    console.error(`[NOTIFY] ${draft.kind} email could not be sent for user ${userId}`, err);
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
    // The email names the session time; the inbox row carries it in prose only,
    // so the sender gets the Date rather than re-parsing copy.
    { scheduledAt: input.scheduledAt },
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
    { scheduledAt: input.scheduledAt },
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
    { scheduledAt: input.scheduledAt },
  );
}
