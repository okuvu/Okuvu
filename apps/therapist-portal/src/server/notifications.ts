import type { PrismaClient } from '@okuvu/prisma';
import { randomUUID } from 'node:crypto';
import {
  buildAppointmentBookedNotification,
  buildAppointmentCancelledNotification,
  buildAppointmentRescheduledNotification,
  buildHomeworkNotification,
  buildReminderNotification,
  buildTreasureNoteNotification,
  startOfIstDay,
  type NotificationDraft,
} from '@okuvu/shared-types';
import { sendClientNotificationEmail, sendClientUpdateEmail } from '@/lib/email';

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

/**
 * Kinds governed by Settings → Notifications → Appointment reminders.
 */
const APPOINTMENT_KINDS = new Set([
  'appointment_booked',
  'appointment_rescheduled',
  'appointment_cancelled',
]);

/**
 * Kinds that send the approved generic email ("Something new in OKUVU").
 *
 * The owner's Step 7 rule: email only when something happens that the client
 * has to act on, and the two named events are an assignment and a Treasure note.
 * `reminder_set` deliberately does not mail — a reminder is a schedule the
 * therapist already discussed, and mailing it is the noise that gets a sender
 * filtered.
 *
 * Appointment kinds keep their own existing copy (the session time is logistics,
 * not clinical) but are now behind the same preference gate and the same
 * one-a-day cap, because "no more than one email per client per day" is a
 * promise about the client's inbox, not about one code path.
 */
const UPDATE_EMAIL_KINDS = new Set(['homework_assigned', 'treasure_note_waiting']);

/** Kinds that may send any email at all. */
const EMAILABLE_KINDS = new Set([...UPDATE_EMAIL_KINDS, ...APPOINTMENT_KINDS]);

interface Recipient {
  email: string | null;
  appointment_reminders_enabled: boolean;
  update_emails_enabled: boolean;
  email_update_token: string | null;
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
    select: {
      email: true,
      appointment_reminders_enabled: true,
      update_emails_enabled: true,
      email_update_token: true,
    },
  });
}

/**
 * Claim this client's one email for today, or lose the race honestly.
 *
 * Written before the send, and as a single conditional UPDATE, so two events
 * fired in the same second cannot both mail: the second one matches no row and
 * skips. The row is the cap; the sender never keeps state of its own.
 */
async function claimDailyEmail(db: NotificationDb, userId: string, now = new Date()): Promise<boolean> {
  try {
    const claimed = await db.user.updateMany({
      where: {
        id: userId,
        update_emails_enabled: true,
        OR: [
          { last_update_email_at: null },
          { last_update_email_at: { lt: startOfIstDay(now) } },
        ],
      },
      data: { last_update_email_at: now },
    });
    return claimed.count === 1;
  } catch (err) {
    console.error('[NOTIFY] could not claim the daily email slot', err);
    return false;
  }
}

/**
 * The pause link's token, minted on the first email and reused afterwards.
 *
 * Random rather than derived: a token that is a hash of the user id is a token
 * anyone holding the id can rebuild, and this URL arrives in a mailbox.
 */
async function ensurePauseToken(
  db: NotificationDb,
  userId: string,
  current: string | null,
): Promise<string | null> {
  if (current) return current;
  try {
    const token = randomUUID();
    await db.user.update({ where: { id: userId }, data: { email_update_token: token } });
    return token;
  } catch (err) {
    console.error('[NOTIFY] could not mint the email pause token', err);
    return null;
  }
}

function pauseUrlFor(token: string): string {
  const base = (process.env.OKUVU_PUBLIC_URL ?? 'https://portal.okuvu.in').replace(/\/+$/, '');
  return `${base}/api/updates/pause?t=${encodeURIComponent(token)}`;
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
        note_body: draft.noteBody ?? null,
        dedupe_key: draft.dedupeKey ?? null,
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

  // The row is written and the rest is best-effort. A kind that does not mail,
  // a client who paused email, and a client who already had today's message all
  // stop here — the Updates list still shows every one of them.
  if (!EMAILABLE_KINDS.has(draft.kind)) return;
  if (!recipient.update_emails_enabled) return;
  if (!(await claimDailyEmail(db, userId))) return;

  try {
    if (UPDATE_EMAIL_KINDS.has(draft.kind)) {
      const token = await ensurePauseToken(db, userId, recipient.email_update_token);
      if (!token) {
        // Without a working pause link the mail would make a promise it cannot
        // keep, so it is not sent at all. The inbox row is unaffected.
        console.error(`[NOTIFY] no pause token for user ${userId} — update email not sent`);
        return;
      }
      await sendClientUpdateEmail({ to: recipient.email, pauseUrl: pauseUrlFor(token) });
      return;
    }

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

/**
 * A note the therapist wrote for the client's Treasure Box.
 *
 * The row carries the approved line, and the note's own words travel in
 * `note_body` where the app does not render them: the client keeps it and reads
 * it in the box. That is also why the email says nothing at all about a note.
 */
export async function notifyTreasureBoxNote(
  db: NotificationDb,
  input: { clientUserId: string; noteBody: string },
): Promise<void> {
  await write(
    db,
    input.clientUserId,
    buildTreasureNoteNotification({ noteBody: input.noteBody }),
  );
}
