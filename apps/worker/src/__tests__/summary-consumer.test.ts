import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SummaryResult } from '../lib/summary.js';
import {
  createSummaryConsumer,
  DISABLED_STATUS,
  getSummaryConsumerStatus,
  MAX_RECEIVE_COUNT,
  parsePayload,
  RETRY_BACKOFF_SECONDS,
  setActiveSummaryConsumer,
  SummaryJobConsumer,
  type ReceivedMessage,
  type SummaryQueueClient,
} from '../lib/summary-consumer.js';

/**
 * A fake SQS transport. Messages are queued in-memory; every call is recorded so
 * a test can assert the acknowledgement *contract* (delete on success, no delete
 * on failure) rather than just a counter that would also go up on a burned
 * message.
 */
class FakeQueue implements SummaryQueueClient {
  readonly deleted: string[] = [];
  readonly visibility: Array<{ receipt_handle: string; seconds: number }> = [];
  readonly receiveCalls: Array<{ queue_url: string; wait: number }> = [];

  private readonly pending: ReceivedMessage[] = [];
  private readonly current: Array<ReceivedMessage | undefined> = [];

  push(message: ReceivedMessage): void {
    this.pending.push(message);
  }

  async receive(input: { QueueUrl: string; WaitTimeSeconds: number }): Promise<{ Messages?: ReceivedMessage[] }> {
    this.receiveCalls.push({ queue_url: input.QueueUrl, wait: input.WaitTimeSeconds });
    const next = this.pending.shift();
    return next ? { Messages: [next] } : { Messages: [] };
  }

  async delete(_queueUrl: string, receiptHandle: string): Promise<void> {
    this.deleted.push(receiptHandle);
  }

  async changeVisibility(_queueUrl: string, receiptHandle: string, seconds: number): Promise<void> {
    this.visibility.push({ receipt_handle: receiptHandle, seconds });
  }
}

function makeMessage(overrides: Partial<ReceivedMessage> = {}): ReceivedMessage {
  return {
    MessageId: 'msg-1',
    ReceiptHandle: 'rh-1',
    Body: JSON.stringify({ session_id: 'sess-1', user_id: 'user-1' }),
    Attributes: { ApproximateReceiveCount: '1' },
    ...overrides,
  };
}

function mockLogger() {
  return { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

const startedConsumers: SummaryJobConsumer[] = [];

function buildConsumer(queue: FakeQueue, generate: (s: string, u: string) => Promise<SummaryResult>) {
  const log = mockLogger();
  const consumer = new SummaryJobConsumer({
    queueUrl: 'https://sqs.ap-south-1.amazonaws.com/562654496378/evia-beta-summary-jobs',
    log,
    clientFactory: async () => queue,
    generate: (sessionId, userId) => generate(sessionId, userId),
    waitTimeSeconds: 0,
    idleDelayMs: 2,
    pollErrorDelayMs: 2,
  });
  startedConsumers.push(consumer);
  return { consumer, log };
}

describe('parsePayload', () => {
  it('accepts the producer contract in apps/api/src/lib/sqs-enqueue.ts', () => {
    expect(parsePayload('{"session_id":"s1","user_id":"u1"}')).toEqual({
      session_id: 's1',
      user_id: 'u1',
    });
  });

  it.each([
    ['empty', ''],
    ['not json', 'not json'],
    ['json array', '[]'],
    ['json null', 'null'],
    ['missing session_id', '{"user_id":"u1"}'],
    ['missing user_id', '{"session_id":"s1"}'],
    ['blank session_id', '{"session_id":"  ","user_id":"u1"}'],
    ['non-string user_id', '{"session_id":"s1","user_id":7}'],
  ])('rejects %s', (_label, body) => {
    expect(parsePayload(body)).toBeNull();
  });
});

describe('SummaryJobConsumer', () => {
  let queue: FakeQueue;

  beforeEach(() => {
    queue = new FakeQueue();
  });

  // A consumer left polling after its test would keep appending to its fake
  // queue for the rest of the file. Stopping every one is the difference
  // between a failing assertion and an OOM that hides which assertion failed.
  afterEach(async () => {
    while (startedConsumers.length > 0) {
      await startedConsumers.pop()?.stop(50).catch(() => undefined);
    }
  });

  it('processes a message, then deletes it', async () => {
    queue.push(makeMessage());
    const { consumer } = buildConsumer(queue, async () => ({ status: 'completed' }));

    await consumer.start();
    await waitFor(() => queue.deleted.length === 1);

    expect(queue.deleted).toEqual(['rh-1']);
    expect(consumer.status().processed).toBe(1);
    expect(consumer.status().receipts).toBe(1);
    expect(consumer.status().last_message_at).not.toBeNull();
    expect(queue.visibility).toHaveLength(0);

    await consumer.stop(50);
  });

  it('treats skipped_trivial and session_not_found as acknowledged outcomes', async () => {
    queue.push(makeMessage({ MessageId: 'msg-a', ReceiptHandle: 'rh-a' }));
    queue.push(makeMessage({ MessageId: 'msg-b', ReceiptHandle: 'rh-b' }));
    const statuses: SummaryResult['status'][] = ['skipped_trivial', 'session_not_found'];
    let call = 0;
    const { consumer } = buildConsumer(queue, async () => ({ status: statuses[call++] }));

    await consumer.start();
    await waitFor(() => queue.deleted.length === 2);

    expect(queue.deleted).toEqual(['rh-a', 'rh-b']);
    expect(consumer.status().failed).toBe(0);

    await consumer.stop(50);
  });

  it('does not delete a failed job and shortens the retry visibility timeout', async () => {
    queue.push(makeMessage());
    const { consumer, log } = buildConsumer(queue, async () => {
      throw new Error('Bedrock throttled');
    });

    await consumer.start();
    await waitFor(() => queue.visibility.length === 1);

    expect(queue.deleted).toHaveLength(0);
    expect(queue.visibility[0]).toEqual({
      receipt_handle: 'rh-1',
      seconds: RETRY_BACKOFF_SECONDS[0],
    });
    expect(consumer.status().failed).toBe(1);
    expect(consumer.status().last_error).toContain('Bedrock throttled');
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'summary_consumer_retry_scheduled', receive_count: 1 }),
      expect.any(String),
    );

    await consumer.stop(50);
  });

  it('uses the second backoff slot on the second delivery', async () => {
    queue.push(makeMessage({ Attributes: { ApproximateReceiveCount: '2' } }));
    const { consumer } = buildConsumer(queue, async () => {
      throw new Error('still failing');
    });

    await consumer.start();
    await waitFor(() => queue.visibility.length === 1);

    expect(queue.visibility[0].seconds).toBe(RETRY_BACKOFF_SECONDS[1]);

    await consumer.stop(50);
  });

  it(`leaves the final delivery to the DLQ redrive policy (maxReceiveCount ${MAX_RECEIVE_COUNT})`, async () => {
    queue.push(makeMessage({ Attributes: { ApproximateReceiveCount: String(MAX_RECEIVE_COUNT) } }));
    const { consumer, log } = buildConsumer(queue, async () => {
      throw new Error('poison');
    });

    await consumer.start();
    await waitFor(() => consumer.status().failed === 1);
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Neither deleted (that would hide it) nor re-shortened (that would spin).
    expect(queue.deleted).toHaveLength(0);
    expect(queue.visibility).toHaveLength(0);
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'summary_consumer_dead_letter_pending' }),
      expect.any(String),
    );

    await consumer.stop(50);
  });

  it('discards an unreadable body instead of retrying it forever', async () => {
    queue.push(makeMessage({ Body: '{"session_id":' }));
    const generate = vi.fn(async () => ({ status: 'completed' as const }));
    const { consumer } = buildConsumer(queue, generate);

    await consumer.start();
    await waitFor(() => queue.deleted.length === 1);

    expect(generate).not.toHaveBeenCalled();
    expect(consumer.status().discarded).toBe(1);
    expect(consumer.status().processed).toBe(0);

    await consumer.stop(50);
  });

  it('does not acknowledge a delivery that carries no receipt handle', async () => {
    queue.push(makeMessage({ ReceiptHandle: undefined }));
    const { consumer } = buildConsumer(queue, async () => ({ status: 'completed' }));

    await consumer.start();
    await waitFor(() => consumer.status().receipts === 1);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(queue.deleted).toHaveLength(0);

    await consumer.stop(50);
  });

  it('keeps polling after a poll error instead of exiting the loop', async () => {
    let calls = 0;
    const flaky: SummaryQueueClient = {
      async receive() {
        calls += 1;
        if (calls === 1) throw new Error('ECONNRESET');
        // Exactly one message, then idle: a fake that returns a message on
        // every poll would starve the event loop, because generated work that
        // resolves synchronously never yields a macrotask and `stop()`'s
        // timer could never fire.
        if (calls === 2) return { Messages: [{ ...makeMessage(), ReceiptHandle: 'rh-after-error' }] };
        await new Promise((resolve) => setTimeout(resolve, 2));
        return { Messages: [] };
      },
      async delete(_q, handle) {
        queue.deleted.push(handle);
      },
      async changeVisibility() {
        /* unused */
      },
    };

    const log = mockLogger();
    const consumer = new SummaryJobConsumer({
      queueUrl: 'https://sqs.example/1/q',
      log,
      clientFactory: async () => flaky,
      generate: async () => ({ status: 'completed' }),
      waitTimeSeconds: 0,
      idleDelayMs: 2,
      pollErrorDelayMs: 2,
    });

    await consumer.start();
    await waitFor(() => queue.deleted.length === 1);

    expect(consumer.status().last_error).toContain('ECONNRESET');
    expect(consumer.status().running).toBe(true);

    await consumer.stop(50);
  });

  it('stop() resolves and marks the loop not running', async () => {
    const { consumer } = buildConsumer(queue, async () => ({ status: 'completed' }));
    await consumer.start();
    expect(consumer.status().running).toBe(true);

    await consumer.stop(500);

    expect(consumer.status().running).toBe(false);
  });

  it('status() reports the queue it polls so a health reader can match it to terraform', async () => {
    const { consumer } = buildConsumer(queue, async () => ({ status: 'completed' }));
    expect(consumer.status().queue_url).toBe(
      'https://sqs.ap-south-1.amazonaws.com/562654496378/evia-beta-summary-jobs',
    );
  });
});

describe('createSummaryConsumer', () => {
  const log = mockLogger();

  beforeEach(() => {
    vi.stubEnv('SQS_QUEUE_URL', '');
    vi.stubEnv('SQS_SUMMARY_QUEUE_URL', '');
    vi.stubEnv('SUMMARY_CONSUMER', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    setActiveSummaryConsumer(null);
  });

  it('returns null and names the missing variable when no queue is configured', () => {
    expect(createSummaryConsumer(log)).toBeNull();
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'summary_consumer_not_configured',
        missing_vars: ['SQS_QUEUE_URL'],
      }),
      expect.any(String),
    );
  });

  it('honours the SUMMARY_CONSUMER=off kill switch even when the queue is set', () => {
    vi.stubEnv('SQS_SUMMARY_QUEUE_URL', 'https://sqs.ap-south-1.amazonaws.com/1/q');
    vi.stubEnv('SUMMARY_CONSUMER', 'off');

    expect(createSummaryConsumer(log)).toBeNull();
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'summary_consumer_disabled' }),
      expect.any(String),
    );
  });

  it('builds a consumer from SQS_SUMMARY_QUEUE_URL, the name ecs.tf injects', () => {
    vi.stubEnv('SQS_SUMMARY_QUEUE_URL', 'https://sqs.ap-south-1.amazonaws.com/1/q');

    const consumer = createSummaryConsumer(log);

    expect(consumer).not.toBeNull();
    expect(consumer?.status().queue_url).toBe('https://sqs.ap-south-1.amazonaws.com/1/q');
    expect(consumer?.status().enabled).toBe(true);
  });

  it('throws on a malformed queue URL rather than silently polling nothing', () => {
    vi.stubEnv('SQS_SUMMARY_QUEUE_URL', 'not-a-url');

    expect(() => createSummaryConsumer(log)).toThrow(/not a valid URL/);
  });

  it('reports a disabled status before any consumer is registered', () => {
    setActiveSummaryConsumer(null);
    expect(getSummaryConsumerStatus()).toEqual(DISABLED_STATUS);
  });
});
