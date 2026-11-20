import { generateSessionSummary, type SummaryResult } from './summary.js';
import { resolveAwsRegion, resolveSqsQueueUrl } from './provider-config.js';

/**
 * SQS consumer for summary jobs (A6 in docs/AWS-MIGRATION-PLAN.md).
 *
 * Before this file existed the chain was:
 *
 *   close session (apps/api) → enqueueSummaryJob → SQS evia-beta-summary-jobs
 *     → *nothing*
 *
 * `apps/worker`'s container command is `node dist/server.js`, a Fastify HTTP
 * server. It had `/tasks/summary`, and nothing in the deployed stack ever
 * called it: the api only takes the direct-HTTP branch when
 * `NODE_ENV=development`, and there is no Lambda or EventSourceMapping in
 * terraform. Messages therefore accumulated with the DLQ at zero — nothing had
 * ever failed, because nothing had ever received — and every client who closed
 * a session saw "No session summary available yet" no matter what consent they
 * had granted. This module is the missing consumer.
 *
 * Design notes, each one deliberate:
 *
 *  • **One message in flight at a time.** The queue's visibility timeout is 900s
 *    and a summary call takes 1–2s; a batch of ten processed sequentially could
 *    sit close enough to 900s that a slow transcript plus a Bedrock retry
 *    returns the same message to another task mid-flight. One at a time keeps
 *    the visibility window an order of magnitude larger than the work. Throughput
 *    is irrelevant here: a handful of sessions close per hour, not per second.
 *
 *  • **Deleting is the acknowledgement, and it happens only after the summary
 *    row is written.** `generateSessionSummary` upserts on
 *    `(user_id, session_id)`, so a redelivery after a crash between write and
 *    delete re-writes the same row instead of duplicating it.
 *
 *  • **A failure does not delete.** The message stays in the queue, its
 *    visibility is shortened so the retry is minutes rather than the full 15,
 *    and after `MAX_RECEIVE_COUNT` deliveries the queue's own redrive policy
 *    (`infrastructure/aws/evia-beta/sqs.tf`, `maxReceiveCount = 3`) moves it to
 *    the DLQ. That is why this file does not implement its own dead-letter
 *    handling: deleting a poison message here would hide it, and leaving it
 *    undeleted while also resetting visibility forever would spin.
 *
 *  • **An unreadable body is discarded, not retried.** A body that is not JSON,
 *    or that is missing `session_id`/`user_id`, will never become readable on
 *    the fourth delivery. Deleting it is the only way to keep it out of the DLQ
 *    as noise; the error log carries the message id and a body preview so the
 *    producer bug is still findable.
 *
 *  • **`{status: 'session_not_found'}` and `'skipped_trivial'` are successes.**
 *    The job ran and reached a verdict. `generateSessionSummary` returns those
 *    rather than throwing, so the ordinary success path deletes them.
 *
 * The consumer carries no HTTP surface of its own: `/tasks/summary` stays for
 * the local-dev bypass and the test harness, and it now runs the same function
 * this loop runs.
 */

export interface ConsumerLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
}

/** Structural shape of the one SQS message field this loop reads. */
export interface ReceivedMessage {
  MessageId?: string;
  ReceiptHandle?: string;
  Body?: string;
  Attributes?: Record<string, string>;
}

export interface ReceiveInput {
  QueueUrl: string;
  MaxNumberOfMessages: number;
  WaitTimeSeconds: number;
  VisibilityTimeout: number;
  MessageSystemAttributeNames: string[];
}

/**
 * The three queue calls this consumer makes, named so a test can stub the
 * transport without an SQS endpoint. The real implementation lives in
 * `createSqsSummaryQueueClient` below and is the only place that imports the
 * AWS SDK.
 */
export interface SummaryQueueClient {
  receive(input: ReceiveInput, signal: AbortSignal): Promise<{ Messages?: ReceivedMessage[] }>;
  delete(queueUrl: string, receiptHandle: string): Promise<void>;
  changeVisibility(queueUrl: string, receiptHandle: string, seconds: number): Promise<void>;
}

/**
 * Keep in step with `redrive_policy.maxReceiveCount` in
 * `infrastructure/aws/evia-beta/sqs.tf`. SQS moves the message to the DLQ once
 * the delivery count passes this, so the consumer stops resetting visibility at
 * this point and lets the queue do its job.
 */
export const MAX_RECEIVE_COUNT = 3;

/**
 * Retry delays per delivery, in seconds. The queue's own visibility timeout is
 * 900s, which would make each retry 15 minutes away; shortening it turns three
 * attempts into a few minutes and gets a transient Bedrock throttle retried
 * inside the same session-close window.
 */
export const RETRY_BACKOFF_SECONDS = [60, 300] as const;

export interface SummaryConsumerStatus {
  /** False when the loop was never started (kill switch, or no queue URL). */
  enabled: boolean;
  running: boolean;
  queue_url: string | null;
  receipts: number;
  processed: number;
  discarded: number;
  failed: number;
  last_poll_at: string | null;
  last_message_at: string | null;
  last_error: string | null;
}

export interface SummaryJobConsumerOptions {
  queueUrl: string;
  log: ConsumerLogger;
  /** Injected in tests; the default is the real SQS transport. */
  clientFactory?: () => Promise<SummaryQueueClient>;
  generate?: (sessionId: string, userId: string, log: ConsumerLogger) => Promise<SummaryResult>;
  waitTimeSeconds?: number;
  visibilityTimeoutSeconds?: number;
  /** Delay after a failed *poll* (throttling, no network) — not after a failed job. */
  pollErrorDelayMs?: number;
  /** Delay after an empty poll when `waitTimeSeconds` is 0 (tests only). */
  idleDelayMs?: number;
}

interface JobPayload {
  session_id: string;
  user_id: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

export class SummaryJobConsumer {
  private readonly queueUrl: string;
  private readonly log: ConsumerLogger;
  private readonly clientFactory: () => Promise<SummaryQueueClient>;
  private readonly generate: (
    sessionId: string,
    userId: string,
    log: ConsumerLogger,
  ) => Promise<SummaryResult>;
  private readonly waitTimeSeconds: number;
  private readonly visibilityTimeoutSeconds: number;
  private readonly pollErrorDelayMs: number;
  private readonly idleDelayMs: number;

  private client: SummaryQueueClient | undefined;
  private loop: Promise<void> | undefined;
  private abort: AbortController | undefined;
  private stopping = false;
  private running = false;

  private readonly counters = {
    receipts: 0,
    processed: 0,
    discarded: 0,
    failed: 0,
  };
  private lastPollAt: string | null = null;
  private lastMessageAt: string | null = null;
  private lastError: string | null = null;

  constructor(options: SummaryJobConsumerOptions) {
    this.queueUrl = options.queueUrl;
    this.log = options.log;
    this.clientFactory = options.clientFactory ?? createSqsSummaryQueueClient;
    this.generate = options.generate ?? generateSessionSummary;
    this.waitTimeSeconds = options.waitTimeSeconds ?? 20;
    this.visibilityTimeoutSeconds = options.visibilityTimeoutSeconds ?? 900;
    this.pollErrorDelayMs = options.pollErrorDelayMs ?? 5_000;
    this.idleDelayMs = options.idleDelayMs ?? Math.max(0, this.waitTimeSeconds) * 1_000;
  }

  /**
   * Begins polling. Resolves as soon as the loop is scheduled, so the HTTP
   * server never waits on SQS to become ready — a queue outage must not stop
   * the worker from answering `/health`.
   */
  async start(): Promise<void> {
    if (this.running) return;

    this.stopAbort(); // clear any stale signal from a previous run
    this.abort = new AbortController();
    this.stopping = false;
    this.running = true;

    this.log.info(
      { event: 'summary_consumer_started', queue_url: this.queueUrl },
      'Summary consumer polling SQS',
    );

    this.loop = this.run(this.abort.signal);
    // Never let a loop rejection become an unhandled rejection: run() catches
    // everything except the deliberate stop, so this is belt and braces.
    void this.loop.catch((err: unknown) => {
      this.running = false;
      this.log.error(
        {
          event: 'summary_consumer_crashed',
          err: err instanceof Error ? err.message : String(err),
        },
        'Summary consumer loop exited unexpectedly',
      );
    });
  }

  /**
   * Stops polling and waits for the in-flight message, bounded so SIGTERM
   * cannot hang. An in-flight summary is allowed to finish: aborting it midway
   * wastes a Bedrock call and leaves the message to be redelivered, which is
   * the same work again.
   */
  async stop(graceMs = 25_000): Promise<void> {
    if (!this.running && !this.loop) return;

    this.stopping = true;
    this.abort?.abort();

    if (this.loop) {
      await Promise.race([this.loop.catch(() => undefined), sleep(graceMs)]);
    }
    this.running = false;

    this.log.info(
      {
        event: 'summary_consumer_stopped',
        processed: this.counters.processed,
        failed: this.counters.failed,
        discarded: this.counters.discarded,
      },
      'Summary consumer stopped',
    );
  }

  status(): SummaryConsumerStatus {
    return {
      enabled: true,
      running: this.running,
      queue_url: this.queueUrl,
      receipts: this.counters.receipts,
      processed: this.counters.processed,
      discarded: this.counters.discarded,
      failed: this.counters.failed,
      last_poll_at: this.lastPollAt,
      last_message_at: this.lastMessageAt,
      last_error: this.lastError,
    };
  }

  private async run(signal: AbortSignal): Promise<void> {
    this.client = await this.clientFactory();

    while (!this.stopping) {
      try {
        const { Messages } = await this.client.receive(
          {
            QueueUrl: this.queueUrl,
            MaxNumberOfMessages: 1,
            WaitTimeSeconds: this.waitTimeSeconds,
            VisibilityTimeout: this.visibilityTimeoutSeconds,
            MessageSystemAttributeNames: ['ApproximateReceiveCount'],
          },
          signal,
        );

        if (this.stopping) break;
        this.lastPollAt = new Date().toISOString();

        const message = Messages?.[0];
        if (!message) {
          if (this.idleDelayMs > 0) await sleep(this.idleDelayMs);
          continue;
        }

        this.counters.receipts += 1;
        await this.handleMessage(message);
      } catch (err) {
        if (this.stopping || isAbort(err)) break;

        this.lastError = err instanceof Error ? err.message : String(err);
        this.log.error(
          { event: 'summary_consumer_poll_failed', err: this.lastError },
          'Summary consumer poll failed — backing off',
        );
        await sleep(this.pollErrorDelayMs);
      }
    }

    this.running = false;
  }

  private async handleMessage(message: ReceivedMessage): Promise<void> {
    const messageId = message.MessageId ?? 'unknown';
    const receiptHandle = message.ReceiptHandle;
    const started = Date.now();

    if (!receiptHandle) {
      // Cannot ack without a handle; it will redeliver, which is the honest
      // outcome for a malformed delivery.
      this.lastError = `message ${messageId} arrived without a ReceiptHandle`;
      this.log.error(
        { event: 'summary_consumer_no_receipt_handle', message_id: messageId },
        'SQS message has no receipt handle — cannot acknowledge',
      );
      return;
    }

    const payload = parsePayload(message.Body ?? '');
    if (!payload) {
      this.counters.discarded += 1;
      this.lastError = `message ${messageId} had an unreadable body`;
      this.log.error(
        {
          event: 'summary_consumer_discarded',
          message_id: messageId,
          body_preview: (message.Body ?? '').slice(0, 200),
        },
        'Summary job body is not a usable {session_id,user_id} — discarding',
      );
      await this.safeDelete(receiptHandle, messageId);
      return;
    }

    try {
      const result = await this.generate(payload.session_id, payload.user_id, this.log);

      this.counters.processed += 1;
      this.lastMessageAt = new Date().toISOString();

      this.log.info(
        {
          event: 'summary_consumer_completed',
          message_id: messageId,
          session_id: payload.session_id,
          user_id: payload.user_id,
          status: result.status,
          elapsed_ms: Date.now() - started,
        },
        'Summary job completed',
      );

      await this.safeDelete(receiptHandle, messageId);
    } catch (err) {
      this.counters.failed += 1;
      this.lastError = err instanceof Error ? err.message : String(err);

      const receiveCount = Number(message.Attributes?.ApproximateReceiveCount ?? '1');
      const attempt = Number.isFinite(receiveCount) && receiveCount > 0 ? receiveCount : 1;

      if (attempt >= MAX_RECEIVE_COUNT) {
        this.log.error(
          {
            event: 'summary_consumer_dead_letter_pending',
            message_id: messageId,
            session_id: payload.session_id,
            user_id: payload.user_id,
            receive_count: attempt,
            err: this.lastError,
            elapsed_ms: Date.now() - started,
          },
          'Summary job failed on its final delivery — the redrive policy moves it to the DLQ',
        );
        return;
      }

      const backoff = RETRY_BACKOFF_SECONDS[attempt - 1] ?? RETRY_BACKOFF_SECONDS[RETRY_BACKOFF_SECONDS.length - 1];

      this.log.error(
        {
          event: 'summary_consumer_retry_scheduled',
          message_id: messageId,
          session_id: payload.session_id,
          user_id: payload.user_id,
          receive_count: attempt,
          retry_in_seconds: backoff,
          err: this.lastError,
          elapsed_ms: Date.now() - started,
        },
        'Summary job failed — retrying',
      );

      try {
        await this.client?.changeVisibility(this.queueUrl, receiptHandle, backoff);
      } catch (visibilityErr) {
        // The message will simply reappear after the full visibility timeout.
        this.log.warn(
          {
            event: 'summary_consumer_retry_deferral_failed',
            message_id: messageId,
            err: visibilityErr instanceof Error ? visibilityErr.message : String(visibilityErr),
          },
          'Could not shorten the retry visibility timeout — the message returns after 900s',
        );
      }
    }
  }

  private async safeDelete(receiptHandle: string, messageId: string): Promise<void> {
    try {
      await this.client?.delete(this.queueUrl, receiptHandle);
    } catch (err) {
      // The summary row is already written and the upsert is idempotent, so a
      // failed delete costs one redelivery, not a duplicate. Log, do not throw.
      this.log.warn(
        {
          event: 'summary_consumer_delete_failed',
          message_id: messageId,
          err: err instanceof Error ? err.message : String(err),
        },
        'Summary job succeeded but the SQS message could not be deleted — it will redeliver',
      );
    }
  }

  private stopAbort(): void {
    if (this.abort) {
      this.abort.abort();
      this.abort = undefined;
    }
  }
}

function isAbort(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === 'AbortError' || err.name === 'TimeoutError';
}

/**
 * Body contract shared with `apps/api/src/lib/sqs-enqueue.ts`
 * (`MessageBody: JSON.stringify({ session_id, user_id })`).
 */
export function parsePayload(body: string): JobPayload | null {
  if (body.trim() === '') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;

  const candidate = parsed as Record<string, unknown>;
  if (!nonEmpty(candidate.session_id) || !nonEmpty(candidate.user_id)) return null;

  return { session_id: candidate.session_id, user_id: candidate.user_id };
}

/**
 * The only place in this module that imports the AWS SDK, and it is imported
 * lazily for the same reason `sqs-enqueue.ts` does: `apps/test-harness` bundles
 * worker sources, and a module-level SDK import would drag the SQS client into
 * builds that never talk to a queue.
 */
export async function createSqsSummaryQueueClient(): Promise<SummaryQueueClient> {
  const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, ChangeMessageVisibilityCommand } =
    await import('@aws-sdk/client-sqs');

  const client = new SQSClient({ region: resolveAwsRegion() });

  return {
    async receive(input, signal) {
      const result = await client.send(
        new ReceiveMessageCommand({
          QueueUrl: input.QueueUrl,
          MaxNumberOfMessages: input.MaxNumberOfMessages,
          WaitTimeSeconds: input.WaitTimeSeconds,
          VisibilityTimeout: input.VisibilityTimeout,
          MessageSystemAttributeNames: ['ApproximateReceiveCount'],
        }),
        { abortSignal: signal },
      );

      return {
        Messages: result.Messages?.map((m) => ({
          MessageId: m.MessageId,
          ReceiptHandle: m.ReceiptHandle,
          Body: m.Body,
          Attributes: m.Attributes,
        })),
      };
    },

    async delete(queueUrl, receiptHandle) {
      await client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle }));
    },

    async changeVisibility(queueUrl, receiptHandle, seconds) {
      await client.send(
        new ChangeMessageVisibilityCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: receiptHandle,
          VisibilityTimeout: seconds,
        }),
      );
    },
  };
}

/**
 * The status the health route reports when no consumer was started, so
 * "disabled" and "crashed" are distinguishable from "processing nothing".
 */
export const DISABLED_STATUS: SummaryConsumerStatus = {
  enabled: false,
  running: false,
  queue_url: null,
  receipts: 0,
  processed: 0,
  discarded: 0,
  failed: 0,
  last_poll_at: null,
  last_message_at: null,
  last_error: null,
};

let activeConsumer: SummaryJobConsumer | null = null;

/** Registered by `server.ts` so `/health` can report the loop without a DI container. */
export function setActiveSummaryConsumer(consumer: SummaryJobConsumer | null): void {
  activeConsumer = consumer;
}

export function getSummaryConsumerStatus(): SummaryConsumerStatus {
  return activeConsumer ? activeConsumer.status() : { ...DISABLED_STATUS };
}

/**
 * Builds the consumer from the environment.
 *
 * Returns `null` — with a log line naming the reason — when polling is switched
 * off or the queue is not configured, rather than throwing. A worker that
 * refuses to boot because SQS is unset would take the api down with it:
 * `assertWorkerReachable` in apps/api fails startup when `/health` is missing.
 *
 * Kill switch: `SUMMARY_CONSUMER=off`. Separate from the queue URL because the
 * two questions are different — "is there a queue" is configuration,
 * "should this task poll" is an incident lever, and rolling back a bad consumer
 * must not require deleting a queue URL from a task definition.
 */
export function createSummaryConsumer(log: ConsumerLogger): SummaryJobConsumer | null {
  if ((process.env.SUMMARY_CONSUMER ?? '').trim().toLowerCase() === 'off') {
    log.warn(
      { event: 'summary_consumer_disabled', reason: 'SUMMARY_CONSUMER=off' },
      'Summary consumer disabled by SUMMARY_CONSUMER=off — session summaries will not be generated',
    );
    return null;
  }

  const queueUrl = resolveSqsQueueUrl();
  if (!queueUrl) {
    log.warn(
      {
        event: 'summary_consumer_not_configured',
        missing_vars: ['SQS_QUEUE_URL'],
      },
      'No SQS summary queue configured — the consumer is not started. Closed sessions will not be summarised.',
    );
    return null;
  }

  return new SummaryJobConsumer({ queueUrl, log });
}
