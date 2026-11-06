import { prisma } from './prisma.js';
import type { NotificationDto } from '@okuvu/shared-types';

/**
 * Read side of the client inbox.
 *
 * Everything here is a pull: the app calls these when Home loads and when the
 * bell is tapped. Nothing in the product yet pushes, so a client who never opens
 * the app still sees none of this — that gap is delivery, not storage, and it is
 * why these rows exist: a sender can be attached to the same record later
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
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
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
