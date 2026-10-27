import type { SQSClient, SendMessageCommandInput } from '@aws-sdk/client-sqs';
import { resolveAwsRegion, resolveSqsQueueUrl } from './provider-config.js';

/**
 * AWS SQS implementation of the `summary-enqueue.ts` contract.
 *
 * Same shape as the Cloud Tasks producer: `enqueueSummaryJob(sessionId,
 * userId, log)` resolving on success, throwing after all retries on failure,
 * no-op + warning when the queue is not configured, and the same
 * `NODE_ENV=development` direct-HTTP bypass so local dev keeps working without
 * any cloud queue at all.
 *
 * Differences from Cloud Tasks, all deliberate:
 *
 *  • Message body is the same JSON (`{session_id, user_id}`) but it is sent as
 *    `MessageBody`, not a base64 HTTP body — the worker consumer reads it
 *    straight from the SQS message. No OIDC token is minted: SQS authenticity
 *    is IAM/transport level (`sqs:SendMessage` on the task role), which is
 *    what lets the worker drop per-request OIDC verification.
 *  • `MessageGroupId` is only set when the queue is FIFO (`…​.fifo`); sending
 *    it to a standard queue is a validation error. FIFO queues also require
 *    `MessageDeduplicationId` when content-based dedup is off — a session id
 *    is a natural dedup key, and re-enqueueing the same session inside the
 *    5-minute dedup window should collapse anyway.
 *  • Retries stay client-side (3 attempts, exponential backoff). SQS's own
 *    delivery retries only help once the message is *in* the queue; they do
 *    nothing for a `SendMessage` that failed on a throttled or unreachable
 *    endpoint, which is the failure this loop covers.
 */

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

let _client: SQSClient | undefined;

/**
 * Lazy client construction: the SDK is only imported when SQS is actually the
 * active transport, so the default Cloud Tasks deployment never loads (or
 * bundles) `@aws-sdk/client-sqs`.
 */
async function getClient(): Promise<SQSClient> {
  if (!_client) {
    const { SQSClient } = await import('@aws-sdk/client-sqs');
    _client = new SQSClient({ region: resolveAwsRegion() });
  }
  return _client;
}

async function sendMessage(client: SQSClient, input: SendMessageCommandInput) {
  const { SendMessageCommand } = await import('@aws-sdk/client-sqs');
  return client.send(new SendMessageCommand(input));
}

/** Test seam: drop the memoised client after changing region/endpoint env. */
export function clearSqsClient(): void {
  _client = undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Log = {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
};

/**
 * Same contract as `validateCloudTasksConfig` but for the SQS seam: names of
 * required-but-unset variables, empty array when configured. `AWS_REGION` is
 * not listed because it has a safe default (`ap-south-1`).
 */
export function validateSqsConfig(): string[] {
  return resolveSqsQueueUrl() ? [] : ['SQS_QUEUE_URL'];
}

function isFifoQueue(queueUrl: string): boolean {
  return queueUrl.split('?')[0].endsWith('.fifo');
}

export async function enqueueSummaryJob(
  sessionId: string,
  userId: string,
  log?: Log,
): Promise<void> {
  const isDev = process.env.NODE_ENV === 'development';
  const workerUrl = process.env.CLOUD_TASKS_WORKER_URL;

  // Local-dev bypass, unchanged from summary-enqueue.ts: with no queue
  // reachable locally, calling the worker directly is what makes
  // close-session → summary testable on a laptop.
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

  const queueUrl = resolveSqsQueueUrl();
  if (!queueUrl) {
    if (log) {
      log.warn(
        { event: 'summary_enqueue', session_id: sessionId, user_id: userId, missing_vars: validateSqsConfig() },
        'SQS not configured — skipping enqueue',
      );
    }
    return;
  }

  const fifo = isFifoQueue(queueUrl);
  const client = await getClient();
  const message: SendMessageCommandInput = {
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify({ session_id: sessionId, user_id: userId }),
    ...(fifo
      ? {
          MessageGroupId: 'summary',
          // Content-based dedup off by default on this queue, so an explicit id
          // is required. One summary job per session is the invariant anyway.
          MessageDeduplicationId: sessionId,
        }
      : {}),
  };

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await sendMessage(client, message);
      if (log) {
        log.info(
          {
            event: 'summary_enqueue',
            session_id: sessionId,
            user_id: userId,
            message_id: response.MessageId,
            outcome: 'enqueued',
            attempt,
          },
          'Summary job enqueued',
        );
      }
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (log) {
        log.warn(
          {
            event: 'summary_enqueue',
            session_id: sessionId,
            user_id: userId,
            err: lastError.message,
            attempt,
            max_retries: MAX_RETRIES,
          },
          'Summary enqueue attempt failed',
        );
      }
      if (attempt < MAX_RETRIES) {
        await delay(BASE_DELAY_MS * Math.pow(2, attempt - 1));
      }
    }
  }

  if (log && lastError) {
    log.error(
      {
        event: 'summary_enqueue',
        session_id: sessionId,
        user_id: userId,
        err: lastError.message,
        outcome: 'failed_all_retries',
        max_retries: MAX_RETRIES,
      },
      'Summary enqueue failed after all retries',
    );
  }
  throw lastError ?? new Error('Summary enqueue failed after all retries');
}
