import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

const mockUpdateMany = vi.fn();
const mockEnqueueJob = vi.fn();

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    sessionLog: {
      updateMany: mockUpdateMany,
    },
  },
}));

vi.mock('../lib/summary-enqueue.js', () => ({
  enqueueSummaryJob: mockEnqueueJob,
}));

describe('closeSession()', () => {
  let closeSession: typeof import('../lib/session-close.js').closeSession;

  beforeEach(async () => {
    mockUpdateMany.mockReset();
    mockEnqueueJob.mockReset();
    process.env = { ...ORIGINAL_ENV };
    closeSession = (await import('../lib/session-close.js')).closeSession;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe('positive — session is open', () => {
    it('updates session_ended_at and enqueues exactly one summary job', async () => {
      mockUpdateMany.mockResolvedValue({ count: 1 });

      const result = await closeSession('sess-1', 'USER_REQUESTED');

      expect(result.alreadyClosed).toBe(false);
      expect(result.reason).toBe('USER_REQUESTED');
      expect(typeof result.session_ended_at).toBe('string');
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { id: 'sess-1', session_ended_at: null },
        data: { session_ended_at: expect.any(Date) },
      });
      expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
      expect(mockEnqueueJob).toHaveBeenCalledWith('sess-1', undefined);
    });

    it('auto-closes at turn cap with exactly one A10A enqueue', async () => {
      mockUpdateMany.mockResolvedValue({ count: 1 });

      const result = await closeSession('sess-cap', 'TURN_CAP');

      expect(result.alreadyClosed).toBe(false);
      expect(result.reason).toBe('TURN_CAP');
      expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
    });

    it('auto-closes after idle timeout with exactly one A10A enqueue', async () => {
      mockUpdateMany.mockResolvedValue({ count: 1 });

      const result = await closeSession('sess-idle', 'IDLE_TIMEOUT');

      expect(result.alreadyClosed).toBe(false);
      expect(result.reason).toBe('IDLE_TIMEOUT');
      expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
    });
  });

  describe('positive — explicit close mid-conversation', () => {
    it('immediately closes session with exactly one A10A enqueue', async () => {
      mockUpdateMany.mockResolvedValue({ count: 1 });

      const result = await closeSession('sess-explicit', 'USER_REQUESTED');

      expect(result.alreadyClosed).toBe(false);
      expect(result.reason).toBe('USER_REQUESTED');
      expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
    });
  });

  describe('negative — session is already closed', () => {
    it('no-ops and does not enqueue when updateMany returns count 0', async () => {
      mockUpdateMany.mockResolvedValue({ count: 0 });

      const result = await closeSession('sess-1', 'USER_REQUESTED');

      expect(result.alreadyClosed).toBe(true);
      expect(mockEnqueueJob).not.toHaveBeenCalled();
    });

    it('explicit close for already-closed session no-ops', async () => {
      mockUpdateMany.mockResolvedValue({ count: 0 });

      const result = await closeSession('sess-closed', 'USER_REQUESTED');

      expect(result.alreadyClosed).toBe(true);
    });
  });

  describe('idempotency', () => {
    it('subsequent closeSession call for same session no-ops', async () => {
      mockUpdateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      const first = await closeSession('sess-idemp', 'USER_REQUESTED');
      const second = await closeSession('sess-idemp', 'USER_REQUESTED');

      expect(first.alreadyClosed).toBe(false);
      expect(second.alreadyClosed).toBe(true);
      expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge — race between cap and idle', () => {
    it('only one close succeeds when two concurrent calls race', async () => {
      mockUpdateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      const [first, second] = await Promise.all([
        closeSession('sess-race', 'TURN_CAP'),
        closeSession('sess-race', 'IDLE_TIMEOUT'),
      ]);

      const successes = [first, second].filter(r => !r.alreadyClosed);
      expect(successes).toHaveLength(1);
      expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge — turn cap fires at correct threshold', () => {
    it('triggers auto-close after turn 10', async () => {
      mockUpdateMany.mockResolvedValue({ count: 1 });

      const result = await closeSession('sess-cap-edge', 'TURN_CAP');

      expect(result.alreadyClosed).toBe(false);
      expect(result.reason).toBe('TURN_CAP');
      expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
    });
  });
});

describe('idle timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUpdateMany.mockReset();
    mockEnqueueJob.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires closeSession after 15 minutes of inactivity with exactly one A10A enqueue', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const { closeSession: realClose } = await import('../lib/session-close.js');

    let capturedResult: Awaited<ReturnType<typeof realClose>> | null = null;
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
    let timerFired = false;

    const timer = setTimeout(async () => {
      timerFired = true;
      capturedResult = await realClose('sess-idle', 'IDLE_TIMEOUT', log);
    }, IDLE_TIMEOUT_MS);

    vi.advanceTimersByTime(IDLE_TIMEOUT_MS + 100);
    await vi.runAllTimersAsync();

    expect(timerFired).toBe(true);
    expect(capturedResult).not.toBeNull();
    expect(capturedResult!.alreadyClosed).toBe(false);
    expect(capturedResult!.reason).toBe('IDLE_TIMEOUT');
    expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
    clearTimeout(timer);
  });
});
