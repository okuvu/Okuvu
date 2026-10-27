import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSqsEnqueue = vi.hoisted(() => vi.fn());
const mockValidateSqsConfig = vi.hoisted(() => vi.fn(() => [] as string[]));

vi.mock('../lib/sqs-enqueue.js', () => ({
  enqueueSummaryJob: mockSqsEnqueue,
  validateSqsConfig: () => mockValidateSqsConfig(),
}));

import { enqueueSummaryJob, validateQueueConfig } from '../lib/summary-enqueue.js';

/**
 * There is exactly one summary-job transport after the cutover: the SQS
 * producer in `sqs-enqueue.ts`. `summary-enqueue.ts` is now a delegating
 * wrapper plus the local-development HTTP bypass, so these tests pin the
 * delegation (same args, rejections unchanged), the bypass (URL shape, body,
 * non-2xx throws) and the validation re-export. The Cloud Tasks assertions that
 * used to live here are gone with the transport, not with the coverage.
 */
const ENV_KEYS = [
  'NODE_ENV',
  'WORKER_INTERNAL_URL',
  'OKUVU_QUEUE_PROVIDER',
  'CLOUD_TASKS_WORKER_URL',
  'SQS_QUEUE_URL',
] as const;

describe('summary-enqueue (single SQS transport)', () => {
  const saved: Record<string, string | undefined> = {};
  const originalFetch = globalThis.fetch;
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    mockSqsEnqueue.mockResolvedValue(undefined);
    mockValidateSqsConfig.mockReturnValue([]);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    globalThis.fetch = originalFetch;
  });

  const log = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

  describe('SQS delegation', () => {
    it('always delegates to the SQS producer, passing session, user and log through', async () => {
      const logger = log();

      await enqueueSummaryJob('session-1', 'user-1', logger);

      expect(mockSqsEnqueue).toHaveBeenCalledTimes(1);
      expect(mockSqsEnqueue).toHaveBeenCalledWith('session-1', 'user-1', logger);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('delegates with no log when the caller passes none', async () => {
      await enqueueSummaryJob('session-2', 'user-2');

      expect(mockSqsEnqueue).toHaveBeenCalledWith('session-2', 'user-2', undefined);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('is unaffected by the retired OKUVU_QUEUE_PROVIDER switch', async () => {
      process.env.OKUVU_QUEUE_PROVIDER = 'cloudtasks';

      await enqueueSummaryJob('session-1', 'user-1');

      expect(mockSqsEnqueue).toHaveBeenCalledTimes(1);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('propagates rejections from the SQS producer unchanged', async () => {
      mockSqsEnqueue.mockRejectedValue(new Error('sqs down'));

      await expect(enqueueSummaryJob('session-1', 'user-1')).rejects.toThrow('sqs down');
    });

    it('stays on SQS in development when no worker URL is configured', async () => {
      process.env.NODE_ENV = 'development';

      await enqueueSummaryJob('session-1', 'user-1');

      expect(mockSqsEnqueue).toHaveBeenCalledTimes(1);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('local-dev direct worker call', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
      process.env.WORKER_INTERNAL_URL = 'http://localhost:8080';
    });

    it('POSTs to ${WORKER_INTERNAL_URL}/tasks/summary instead of enqueuing', async () => {
      const logger = log();

      await enqueueSummaryJob('session-1', 'user-1', logger);

      expect(mockSqsEnqueue).not.toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:8080/tasks/summary');
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(JSON.parse(init.body)).toEqual({ session_id: 'session-1', user_id: 'user-1' });

      // Local-bypass path is logged by event name, without leaking content.
      expect(logger.info).toHaveBeenCalled();
      expect(logger.info.mock.calls[0][0]).toMatchObject({
        event: 'summary_enqueue_local',
        session_id: 'session-1',
        user_id: 'user-1',
      });
    });

    it('normalises a trailing slash on WORKER_INTERNAL_URL', async () => {
      process.env.WORKER_INTERNAL_URL = 'http://localhost:8080/';

      await enqueueSummaryJob('session-1', 'user-1');

      expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:8080/tasks/summary');
    });

    it('throws with the status and body on a non-2xx response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'worker unavailable',
      });

      await expect(enqueueSummaryJob('session-1', 'user-1')).rejects.toThrow(
        'Worker returned 503: worker unavailable',
      );
    });

    it('throws when the worker call rejects at the transport level', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(enqueueSummaryJob('session-1', 'user-1')).rejects.toThrow('ECONNREFUSED');
    });

    it('only applies outside development when NODE_ENV is production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.WORKER_INTERNAL_URL = 'http://localhost:8080';

      await enqueueSummaryJob('session-1', 'user-1');

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockSqsEnqueue).toHaveBeenCalledTimes(1);
    });
  });

  describe('validateQueueConfig', () => {
    it('re-exports the SQS validation result', () => {
      mockValidateSqsConfig.mockReturnValue(['SQS_QUEUE_URL']);

      expect(validateQueueConfig()).toEqual(['SQS_QUEUE_URL']);
      expect(mockValidateSqsConfig).toHaveBeenCalledTimes(1);
    });

    it('is empty once the SQS queue URL resolves', () => {
      mockValidateSqsConfig.mockReturnValue([]);

      expect(validateQueueConfig()).toEqual([]);
    });
  });
});
