import type { PrismaClient } from '@okuvu/prisma';
import { BROADCAST_KINDS, startOfIstDay } from '@okuvu/shared-types';
import { sendPushToUser } from './push.js';
import { prisma } from './prisma.js';

/**
 * Admin → everyone. The second sender class, and it is deliberately not the
 * first one with a different recipient.
 *
 * A therapist's send is about one client's care and rides on the row that action
 * wrote. A broadcast is an announcement: service news, a festival greeting. It
 * shares the inbox row and the lock screen, but not the policy —
 *
 * - it has its own switch (`broadcast_push_enabled`), so muting announcements
 *   never costs a client their therapist's homework reminder;
 * - it has its own cap, **one per client per IST day**, claimed before the
 *   fan-out. Two campaigns in one afternoon must not buzz the same phone twice,
 *   and an admin who can do that teaches clients to turn notifications off;
 * - the push says "News from OKUVU" and nothing else. The admin's words live in
 *   the inbox row, which the client reads having chosen to open the app. A
 *   greeting is harmless; the same mechanism carrying something clinical onto a
 *   lock screen is not, so the wording is fixed in `@okuvu/shared-types`.
 *
 * Rows are written for **every** active client whether or not their push is on —
 * the switch governs the buzz, never the record. A client who muted
 * announcements still finds them in the Updates list.
 */

export type BroadcastDb = Pick<PrismaClient, 'user' | 'notification'>;

export interface BroadcastInput {
  kind: string;
  title: string;
  body: string;
  /** Stable id for this campaign; makes a retried call write no second row. */
  campaignId: string;
  now?: Date;
}

export interface BroadcastResult {
  recipients: number;
  rowsWritten: number;
  pushed: number;
  skippedForCap: number;
}

const MAX_TITLE = 120;
const MAX_BODY = 500;

export function validateBroadcast(input: {
  kind?: unknown;
  title?: unknown;
  body?: unknown;
}): { kind: string; title: string; body: string } | { error: string } {
  const kind = typeof input.kind === 'string' ? input.kind.trim() : '';
  if (!(BROADCAST_KINDS as readonly string[]).includes(kind)) {
    return { error: `kind must be one of ${BROADCAST_KINDS.join(', ')}` };
  }
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (!title || !body) return { error: 'title and body are required' };
  if (title.length > MAX_TITLE) return { error: `title must be ${MAX_TITLE} characters or fewer` };
  if (body.length > MAX_BODY) return { error: `body must be ${MAX_BODY} characters or fewer` };
  return { kind, title, body };
}

export async function sendBroadcast(
  input: BroadcastInput,
  db: BroadcastDb = prisma,
): Promise<BroadcastResult> {
  const now = input.now ?? new Date();

  const recipients = await db.user.findMany({
    where: { deleted_at: null },
    select: { id: true },
  });
  if (recipients.length === 0) {
    return { recipients: 0, rowsWritten: 0, pushed: 0, skippedForCap: 0 };
  }

  const { count: rowsWritten } = await db.notification.createMany({
    data: recipients.map((user) => ({
      user_id: user.id,
      kind: input.kind,
      title: input.title,
      body: input.body,
      // Per-campaign AND per-client, because the column is globally unique: a
      // retried campaign updates nothing, while a new campaign to the same
      // client is a legitimate second row.
      dedupe_key: `broadcast:${input.campaignId}:${user.id}`,
    })),
    skipDuplicates: true,
  });

  // The day's slot is claimed in one conditional UPDATE, before any send, so two
  // campaigns in the same second cannot both buzz the same phone.
  const claimed = await db.user.updateMany({
    where: {
      deleted_at: null,
      broadcast_push_enabled: true,
      OR: [{ last_broadcast_at: null }, { last_broadcast_at: { lt: startOfIstDay(now) } }],
    },
    data: { last_broadcast_at: now },
  });

  const eligible = await db.user.findMany({
    where: { deleted_at: null, last_broadcast_at: now },
    select: { id: true },
  });

  let pushed = 0;
  for (const user of eligible) {
    try {
      const result = await sendPushToUser({ userId: user.id, kind: input.kind }, db as never);
      if (result.sent > 0) pushed += 1;
    } catch (err) {
      // One phone failing is not a reason to abandon the campaign; the rows are
      // already written and the client will see the announcement in the app.
      console.error('[PUSH] broadcast send failed for one client', err);
    }
  }

  return {
    recipients: recipients.length,
    rowsWritten,
    pushed,
    skippedForCap: Math.max(0, recipients.length - claimed.count),
  };
}
