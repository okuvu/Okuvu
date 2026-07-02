import type { CloseReason } from '@evia/shared-types';
import { prisma } from './prisma.js';
import { enqueueSummaryJob } from './summary-enqueue.js';

export type LogFn = (obj: Record<string, unknown>, msg: string) => void;

export interface CloseSessionResult {
  alreadyClosed: boolean;
  session_ended_at?: string;
  reason?: CloseReason;
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

  enqueueSummaryJob(sessionId, userId, log).catch((err) => {
    if (log) {
      log.error({ event: 'summary_enqueue', session_id: sessionId, user_id: userId, err }, 'Summary enqueue failed (Cloud Tasks will retry)');
    }
  });

  if (log) {
    log.info({ event: 'session_close', session_id: sessionId, user_id: userId, reason, session_ended_at: now.toISOString(), outcome: 'closed' }, 'Session closed');
  }

  return {
    alreadyClosed: false,
    session_ended_at: now.toISOString(),
    reason,
  };
}
