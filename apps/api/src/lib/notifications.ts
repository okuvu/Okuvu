import { prisma } from './prisma.js';
import {
  buildDueTodayNotification,
  getISTDateString,
  type NotificationDto,
} from '@okuvu/shared-types';
import { endOfIstDay, startOfIstDay } from './homework.js';

/**
 * Read side of the client inbox.
 *
 * Everything here is a pull: the app calls these when Home loads and when the
 * bell is tapped. Delivery is the therapist portal's job — it writes these rows
 * and emails the client a logistics-only pointer to them (`server/notifications.ts`
 * there). Nothing pushes a notification to the handset, so a client who opens no
 * email and no app still sees none of this; that remaining gap is push, and it is
 * why these rows exist: a push sender can be attached to the same record later
 * without a second system of record.
 */

const LIST_LIMIT_DEFAULT = 30;
const LIST_LIMIT_MAX = 100;

export interface ListNotificationsInput {
  clientUserId: string;
  limit: number;
  /** Cursor: return rows strictly older than this instant. */
  before?: Date;
}

function toDto(row: {
  id: string;
  kind: string;
  title: string;
  body: string;
  homework_id: string | null;
  appointment_id: string | null;
  read_at: Date | null;
  created_at: Date;
}): NotificationDto {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    homeworkId: row.homework_id,
    appointmentId: row.appointment_id,
    readAt: row.read_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

export function clampListLimit(raw: string | undefined): { limit: number } | { error: string } {
  if (raw === undefined) return { limit: LIST_LIMIT_DEFAULT };
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || !Number.isInteger(parsed) || parsed < 1 || parsed > LIST_LIMIT_MAX) {
    return { error: `limit must be an integer between 1 and ${LIST_LIMIT_MAX}` };
  }
  return { limit: parsed };
}

/**
 * One page of the inbox plus the badge count.
 *
 * The count is of **all** unread rows, not the page: a client with 40 unread and
 * a 30-row page must see 40 on the bell or the badge quietly under-reports.
 *
 * Unread first, then newest first: the owner's rule is that unread updates are
 * what a client sees when they open the app, and a row stays unread until it is
 * opened. Sorting purely by time would bury an unseen update under rows the
 * client has already read and tapped past.
 */
export async function listNotifications(
  input: ListNotificationsInput,
): Promise<{ notifications: NotificationDto[]; unreadCount: number }> {
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: {
        user_id: input.clientUserId,
        ...(input.before ? { created_at: { lt: input.before } } : {}),
      },
      orderBy: [
        { read_at: { sort: 'asc', nulls: 'first' } },
        { created_at: 'desc' },
        { id: 'desc' },
      ],
      take: input.limit,
    }),
    prisma.notification.count({
      where: { user_id: input.clientUserId, read_at: null },
    }),
  ]);

  return { notifications: rows.map(toDto), unreadCount };
}

export async function countUnread(clientUserId: string): Promise<number> {
  return prisma.notification.count({ where: { user_id: clientUserId, read_at: null } });
}

export type MarkReadResult = { status: 'ok' } | { status: 'not_found' };

/**
 * Mark one row read. Scoped to the owning user so a guessed id cannot touch
 * another client's row, and idempotent: re-reading an already-read row is a
 * success, because the app may retry on a flaky connection.
 */
export async function markNotificationRead(
  clientUserId: string,
  notificationId: string,
): Promise<MarkReadResult> {
  const existing = await prisma.notification.findFirst({
    where: { id: notificationId, user_id: clientUserId },
    select: { id: true, read_at: true },
  });

  if (!existing) return { status: 'not_found' };
  if (existing.read_at) return { status: 'ok' };

  await prisma.notification.update({
    where: { id: notificationId },
    data: { read_at: new Date() },
  });

  return { status: 'ok' };
}

/** Mark every unread row read. Returns how many changed. */
export async function markAllRead(clientUserId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { user_id: clientUserId, read_at: null },
    data: { read_at: new Date() },
  });

  return result.count;
}

/**
 * Write the "Due today" rows for assignments due on the client's current IST day.
 *
 * Nothing runs on a clock in this deployment — there is no scheduler and no push
 * — so the only moment we know the client is looking is the read. Deriving the
 * row here rather than in a sweeper means the row exists exactly when someone
 * can see it, and `dedupe_key` makes a re-read harmless: one row per assignment
 * per day, never a stack of duplicates.
 *
 * A failure here must not fail the inbox: the list is still the thing the client
 * opened, and a missing "due today" row is a smaller loss than an empty screen.
 */
export async function ensureDueTodayNotifications(
  clientUserId: string,
  now: Date = new Date(),
): Promise<number> {
  try {
    const dayStart = startOfIstDay(now);
    const dayEnd = endOfIstDay(now);
    const istDate = getISTDateString(now);

    const due = await prisma.homework.findMany({
      where: {
        client_user_id: clientUserId,
        status: 'active',
        due_at: { gte: dayStart, lte: dayEnd },
        OR: [{ last_completed_at: null }, { last_completed_at: { lt: dayStart } }],
      },
      select: { id: true, description: true },
      take: 20,
    });

    if (due.length === 0) return 0;

    const result = await prisma.notification.createMany({
      data: due.map((homework) => {
        const draft = buildDueTodayNotification({
          homeworkId: homework.id,
          description: homework.description,
          istDate,
        });
        return {
          user_id: clientUserId,
          kind: draft.kind,
          title: draft.title,
          body: draft.body,
          homework_id: draft.homeworkId ?? null,
          dedupe_key: draft.dedupeKey ?? null,
        };
      }),
      skipDuplicates: true,
    });

    return result.count;
  } catch (err) {
    console.error('[inbox] could not derive the due-today rows', err);
    return 0;
  }
}

export type KeepNoteResult =
  | { status: 'ok'; noteId: string }
  | { status: 'not_found' }
  | { status: 'nothing_to_keep' };

/**
 * "Keep" on a waiting Treasure Box note.
 *
 * The note text lives on the notification row and is copied — not linked — into
 * the client's box, so dismissing the update afterwards cannot empty the
 * keepsake. `source_ref` points at the notification id and is the idempotency
 * key: tapping Keep twice returns the same note rather than a second copy.
 *
 * A row that is not this client's answers `not_found`, exactly as a made-up id
 * does, so the endpoint cannot be used to probe.
 */
export async function keepTreasureNote(
  clientUserId: string,
  notificationId: string,
): Promise<KeepNoteResult> {
  const row = await prisma.notification.findFirst({
    where: { id: notificationId, user_id: clientUserId, kind: 'treasure_note_waiting' },
    select: { id: true, note_body: true, read_at: true },
  });

  if (!row) return { status: 'not_found' };
  if (!row.note_body || row.note_body.trim().length === 0) {
    return { status: 'nothing_to_keep' };
  }

  const existing = await prisma.treasureNote.findFirst({
    where: { user_id: clientUserId, source_ref: row.id },
    select: { id: true },
  });

  if (existing) {
    if (!row.read_at) {
      await prisma.notification.update({
        where: { id: row.id },
        data: { read_at: new Date() },
      });
    }
    return { status: 'ok', noteId: existing.id };
  }

  const note = await prisma.treasureNote.create({
    data: {
      user_id: clientUserId,
      body: row.note_body,
      source: 'therapist',
      source_ref: row.id,
    },
    select: { id: true },
  });

  await prisma.notification.update({
    where: { id: row.id },
    data: { read_at: new Date() },
  });

  return { status: 'ok', noteId: note.id };
}
