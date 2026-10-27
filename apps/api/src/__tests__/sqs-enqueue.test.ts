import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSend = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: vi.fn(() => ({ send: mockSend })),
  SendMessageCommand: vi.fn((input: unknown) => ({ __type: 'SendMessageCommand', input })),
}));

import { enqueueSummaryJob, validateSqsConfig, clearSqsClient } from '../lib/sqs-enqueue.js';

const QUEUE_URL = 'https://sqs.ap-south-1.amazonaws.com/123456789012/evia-beta-summary-jobs';

const ENV_KEYS = [
  'SQS_QUEUE_URL',
  'SQS_SUMMARY_QUEUE_URL',
  'AWS_REGION',
  'NODE_ENV',
  'CLOUD_TASKS_WORKER_URL',
] as const;

function makeLog() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('enqueueSummaryJob (SQS)', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    clearSqsClient();
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    process.env.SQS_QUEUE_URL = QUEUE_URL;
    mockSend.mockResolvedValue({ MessageId: 'msg-1' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('sends the same JSON payload the Cloud Tasks producer sent', async () => {
    const log = makeLog();

    await enqueueSummaryJob('session-1', 'user-1', log);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const input = mockSend.mock.calls[0][0].input;
    expect(input.QueueUrl).toBe(QUEUE_URL);
    expect(JSON.parse(input.MessageBody)).toEqual({ session_id: 'session-1', user_id: 'user-1' });
    // Standard queue: FIFO-only fields must not be sent.
    expect(input.MessageGroupId).toBeUndefined();
    expect(input.MessageDeduplicationId).toBeUndefined();

    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'summary_enqueue', message_id: 'msg-1', outcome: 'enqueued' }),
      'Summary job enqueued',
    );
  });

  it('adds FIFO-only fields for a .fifo queue', async () => {
    process.env.SQS_QUEUE_URL = `${QUEUE_URL}.fifo`;
    clearSqsClient();

    await enqueueSummaryJob('session-1', 'user-1');

    const input = mockSend.mock.calls[0][0].input;
    expect(input.MessageGroupId).toBe('summary');
    expect(input.MessageDeduplicationId).toBe('session-1');
  });

  it('accepts the SQS_SUMMARY_QUEUE_URL alias the Terraform stack injects', async () => {
    delete process.env.SQS_QUEUE_URL;
    process.env.SQS_SUMMARY_QUEUE_URL = QUEUE_URL;

    await enqueueSummaryJob('session-1', 'user-1');

    expect(mockSend.mock.calls[0][0].input.QueueUrl).toBe(QUEUE_URL);
  });

  it('warns and no-ops when no queue URL is configured', async () => {
    delete process.env.SQS_QUEUE_URL;
    const log = makeLog();

    await expect(enqueueSummaryJob('session-1', 'user-1', log)).resolves.toBeUndefined();

    expect(mockSend).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ missing_vars: ['SQS_QUEUE_URL'] }),
      'SQS not configured — skipping enqueue',
    );
  });

  // The retry loop uses real exponential backoff (1s, 2s → 3s total). Faking
  // the clock hangs here: the loop's awaited `delay()` and the mocked SDK
  // promise chain don't interleave under Vitest's fake timers, so these two
  // tests run in real time with an explicit timeout. 3s of test time is a fair
  // price for testing the real backoff path.
  it('retries three times with backoff, then throws the last error', async () => {
    mockSend.mockRejectedValue(new Error('ThrottlingException'));
    const log = makeLog();

    await expect(enqueueSummaryJob('session-1', 'user-1', log)).rejects.toThrow(
      'ThrottlingException',
    );

    expect(mockSend).toHaveBeenCalledTimes(3);
    expect(log.warn).toHaveBeenCalledTimes(3);
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed_all_retries', max_retries: 3 }),
      'Summary enqueue failed after all retries',
    );
  }, 15_000);

  it('succeeds on a later attempt without throwing', async () => {
    mockSend
      .mockRejectedValueOnce(new Error('ThrottlingException'))
      .mockResolvedValueOnce({ MessageId: 'msg-2' });

    await expect(enqueueSummaryJob('session-1', 'user-1')).resolves.toBeUndefined();

    expect(mockSend).toHaveBeenCalledTimes(2);
  }, 15_000);

  it('keeps the local-dev direct-HTTP bypass and never touches SQS', async () => {
    process.env.NODE_ENV = 'development';
    process.env.CLOUD_TASKS_WORKER_URL = 'http://localhost:3002/';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);

    await enqueueSummaryJob('session-1', 'user-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3002/tasks/summary');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ session_id: 'session-1', user_id: 'user-1' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('surfaces a failing direct worker call in the dev bypass', async () => {
    process.env.NODE_ENV = 'development';
    process.env.CLOUD_TASKS_WORKER_URL = 'http://localhost:3002';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }),
    );

    await expect(enqueueSummaryJob('session-1', 'user-1')).rejects.toThrow('Worker returned 500: boom');
  });
});

describe('validateSqsConfig', () => {
  const savedQueue = process.env.SQS_QUEUE_URL;
  const savedAlias = process.env.SQS_SUMMARY_QUEUE_URL;

  afterEach(() => {
    if (savedQueue === undefined) delete process.env.SQS_QUEUE_URL;
    else process.env.SQS_QUEUE_URL = savedQueue;
    if (savedAlias === undefined) delete process.env.SQS_SUMMARY_QUEUE_URL;
    else process.env.SQS_SUMMARY_QUEUE_URL = savedAlias;
  });

  it('reports the missing queue URL', () => {
    delete process.env.SQS_QUEUE_URL;
    delete process.env.SQS_SUMMARY_QUEUE_URL;
    expect(validateSqsConfig()).toEqual(['SQS_QUEUE_URL']);
  });

  it('returns an empty array when configured', () => {
    process.env.SQS_QUEUE_URL = QUEUE_URL;
    expect(validateSqsConfig()).toEqual([]);
  });
});
