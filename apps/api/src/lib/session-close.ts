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
      log.warn({ event: 'session_close', session_id: sessionId, reason, outcome: 'already_closed' }, 'Session was already closed — no-op');
    }
    return { alreadyClosed: true };
  }

  await enqueueSummaryJob(sessionId, log);

  if (log) {
    log.info({ event: 'session_close', session_id: sessionId, reason, session_ended_at: now.toISOString(), outcome: 'closed' }, 'Session closed');
  }

  return {
    alreadyClosed: false,
    session_ended_at: now.toISOString(),
    reason,
  };
}
