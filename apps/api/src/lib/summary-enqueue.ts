import { enqueueSummaryJob as enqueueSummaryJobOnSqs, validateSqsConfig } from './sqs-enqueue.js';

/**
 * Summary-job enqueue: Amazon SQS only.
 *
 * This module used to dispatch between Google Cloud Tasks (the default) and
 * SQS. Cloud Tasks is gone (docs/AWS-CUTOVER-SPEC.md), so there is one
 * transport — the SQS producer in `sqs-enqueue.ts` — and the retry/backoff that
 * used to live here now belongs to that producer and to the queue's own
 * redrive policy (`infrastructure/aws/evia-beta/sqs.tf`).
 *
 * The one remaining special case is local development: with
 * `NODE_ENV=development` and `WORKER_INTERNAL_URL` set, the API calls the
 * worker's HTTP endpoint directly. That path predates any cloud queue and is
 * kept because running LocalStack just to see a summary job is a worse dev
 * loop.
 */

export function validateQueueConfig(): string[] {
  return validateSqsConfig();
}

export async function enqueueSummaryJob(
  sessionId: string,
  userId: string,
  log?: {
    info: (obj: Record<string, unknown>, msg: string) => void;
    warn: (obj: Record<string, unknown>, msg: string) => void;
    error: (obj: Record<string, unknown>, msg: string) => void;
  },
): Promise<void> {
  const isDev = process.env.NODE_ENV === 'development';
  const workerUrl = process.env.WORKER_INTERNAL_URL;

  if (isDev && workerUrl) {
    const url = `${workerUrl.replace(/\/$/, '')}/tasks/summary`;
    if (log) {
      log.info(
        { event: 'summary_enqueue_local', session_id: sessionId, user_id: userId, url },
        'Calling worker directly (local dev bypass)',
      );
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, user_id: userId }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Worker returned ${res.status}: ${text}`);
    }
    if (log) {
      log.info(
        { event: 'summary_enqueue_local', session_id: sessionId, user_id: userId, outcome: 'completed' },
        'Worker called directly',
      );
    }
    return;
  }

  return enqueueSummaryJobOnSqs(sessionId, userId, log);
}
