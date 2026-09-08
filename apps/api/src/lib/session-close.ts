import type { CloseReason } from '@okuvu/shared-types';
import { prisma } from './prisma.js';
import { enqueueSummaryJob } from './summary-enqueue.js';

export type LogFn = (obj: Record<string, unknown>, msg: string) => void;

export interface CloseSessionResult {
  alreadyClosed: boolean;
  session_ended_at?: string;
  reason?: CloseReason;
  summaryEnqueued?: boolean;
}

export async function closeSession(
  sessionId: string,
  userId: string,
  reason: CloseReason,
  log?: { info: LogFn; warn: LogFn; error: LogFn },
): Promise<CloseSessionResult> {
  const now = new Date();

  const result = await prisma.sessionLog.updateMany({
    where: { id: sessionId, session_ended_at: null },
    data: { session_ended_at: now },
  });

  if (result.count === 0) {
    if (log) {
      log.warn({ event: 'session_close', session_id: sessionId, user_id: userId, reason, outcome: 'already_closed' }, 'Session was already closed — no-op');
    }
    return { alreadyClosed: true };
  }

  const user = await prisma.user.findUnique({ where: { firebase_uid: userId } });
  const dbUserId = user?.id ?? userId;

  let summaryEnqueued = false;
  try {
    await enqueueSummaryJob(sessionId, dbUserId, log);
    summaryEnqueued = true;
  } catch (err) {
    if (log) {
      log.error({ event: 'session_close', session_id: sessionId, user_id: userId, err: err instanceof Error ? err.message : String(err), outcome: 'summary_enqueue_failed' }, 'Session closed but summary enqueue failed after all retries');
    }
  }

  if (log) {
    log.info({ event: 'session_close', session_id: sessionId, user_id: userId, reason, session_ended_at: now.toISOString(), outcome: 'closed', summary_enqueued: summaryEnqueued }, 'Session closed');
  }

  return {
    alreadyClosed: false,
    session_ended_at: now.toISOString(),
    reason,
    summaryEnqueued,
  };
}
