/**
 * TH-S34/S36 helper — the runner's synchronous session close.
 *
 * `conversation.ts`'s `simulateSessionClose` already established the
 * two-step: real `closeSession` DB write, then an explicit worker-triggered
 * summary/memory pass via the A13 adapter (because `enqueueSummaryJob`'s
 * Cloud-Tasks path can't run in this environment). This module extracts the
 * same flow so the multi-session orchestrator can reuse it, and — per C1
 * (TH-S36) — verifies the outcome from DURABLE state (the SessionSummary +
 * UserMemory rows), not just from the HTTP response: a worker that claims
 * success but wrote nothing is a C1 failure.
 */

import { prisma } from './prisma';
import { invokeAgent } from './agent-adapter';

export interface SessionCloseOutcome {
  /** closeSession completed and the worker reported processed:true. */
  processed: boolean;
  /** A SessionSummary row exists for this session. */
  summaryWritten: boolean;
  /** The user's UserMemory row exists (memory extraction ran). */
  memoryWritten: boolean;
  error: string | null;
}

export async function closeSessionDirect(sessionId: string, uid: string): Promise<SessionCloseOutcome> {
  const { closeSession } = await import('@okuvu/api/src/lib/session-close');

  let error: string | null = null;
  try {
    await closeSession(sessionId, uid, 'USER_REQUESTED');
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const worker = await invokeAgent('A13', { sessionId, userId: uid });
  const output = worker.output as { processed?: boolean; error?: string } | null;
  const workerOk = Boolean(output) && !output?.error && output?.processed !== false;
  if (!workerOk && !error) {
    error = output?.error ?? 'Worker summary call returned no result.';
  }

  // C1 verification from durable state — the HTTP verdict alone is not
  // evidence (the 20 Sep failure mode: worker unreachable, everything
  // upstream still green).
  let summaryWritten = false;
  let memoryWritten = false;
  if (prisma) {
    const summaryRow = await prisma.sessionSummary.findFirst({ where: { session_id: sessionId } });
    summaryWritten = Boolean(summaryRow && summaryRow.summary_text);
    const user = await prisma.user.findUnique({ where: { firebase_uid: uid }, select: { id: true } });
    if (user) {
      const memoryRow = await prisma.userMemory.findUnique({ where: { user_id: user.id } });
      memoryWritten = Boolean(memoryRow);
    }
  }

  return {
    processed: workerOk && !error,
    summaryWritten,
    memoryWritten,
    error,
  };
}
