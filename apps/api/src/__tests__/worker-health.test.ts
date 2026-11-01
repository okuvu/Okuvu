import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  assertWorkerReachable,
  getWorkerUrl,
  checkWorkerHealth,
  type WorkerWaitOptions,
} from '../lib/worker-health.js';

/**
 * The startup assertion is the guard that stops the API from booting into a
 * continuity hole (A1). Two properties have to hold at once, and a single
 * probe can only express one of them:
 *
 *   1. a worker that is genuinely down still kills startup — fail closed;
 *   2. a worker that is *mid-rollout* does not, because the deploy pipeline
 *      rolls the worker and the API from the same build and the old worker
 *      task is drained before the new one is listening. On 2026-11-01 that
 *      race killed an API task 4s after start with `fetch failed`
 *      (evia-beta, task 3c3b54c25f3247fab671fc341deb40d2, exitCode 1).
 *
 * So: bounded retry, then the same hard failure. These tests pin both.
 */

const WORKER_URL = 'http://worker.evia-beta.local:8080';

function okResponse(body: unknown = { status: 'ok', db: 'ok' }): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

function failingResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
  } as unknown as Response;
}

/** Fast bounds so the suite never waits on a real clock. */
const FAST: WorkerWaitOptions = { waitMs: 100, pollMs: 5 };

function fakeLog() {
  return { info: vi.fn(), warn: vi.fn() };
}

describe('worker-health getWorkerUrl', () => {
  const original = process.env.WORKER_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.WORKER_URL;
    else process.env.WORKER_URL = original;
  });

  it('reads WORKER_URL', () => {
    process.env.WORKER_URL = WORKER_URL;
    expect(getWorkerUrl()).toBe(WORKER_URL);
  });

  it('is null when unset', () => {
    delete process.env.WORKER_URL;
    expect(getWorkerUrl()).toBeNull();
  });
});

describe('worker-health checkWorkerHealth', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports reachable with a healthy db', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse()));
    await expect(checkWorkerHealth(WORKER_URL)).resolves.toEqual({
      reachable: true,
      db: 'ok',
    });
  });

  it('reports reachable but db unreachable when the worker says so', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse({ db: 'unreachable' })));
    await expect(checkWorkerHealth(WORKER_URL)).resolves.toEqual({
      reachable: true,
      db: 'unreachable',
    });
  });

  it('does not treat a non-2xx as reachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => failingResponse(503)));
    const result = await checkWorkerHealth(WORKER_URL);
    expect(result.reachable).toBe(false);
    expect(result.error).toContain('503');
  });

  it('does not throw on a network failure — it returns unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    await expect(checkWorkerHealth(WORKER_URL)).resolves.toMatchObject({
      reachable: false,
      db: 'unknown',
    });
  });
});

describe('worker-health assertWorkerReachable', () => {
  const originalWorkerUrl = process.env.WORKER_URL;

  beforeEach(() => {
    process.env.WORKER_URL = WORKER_URL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    if (originalWorkerUrl === undefined) delete process.env.WORKER_URL;
    else process.env.WORKER_URL = originalWorkerUrl;
  });

  it('fails closed when WORKER_URL is not configured', async () => {
    delete process.env.WORKER_URL;
    const fetchStub = vi.fn();
    vi.stubGlobal('fetch', fetchStub);

    await expect(assertWorkerReachable(fakeLog(), FAST)).rejects.toThrow(/WORKER_URL is not configured/);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('passes on the first probe when the worker is up', async () => {
    const fetchStub = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchStub);
    const log = fakeLog();

    await expect(assertWorkerReachable(log, FAST)).resolves.toBeUndefined();
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'worker_health' }),
      'Worker health assertion passed',
    );
  });

  it('retries through a worker rollout and passes once the worker answers', async () => {
    // The mid-roll window: two connection failures, then the new worker task.
    const fetchStub = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal('fetch', fetchStub);
    const log = fakeLog();

    await expect(assertWorkerReachable(log, FAST)).resolves.toBeUndefined();
    expect(fetchStub).toHaveBeenCalledTimes(3);
    expect(log.warn).toHaveBeenCalledTimes(2);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'worker_health', attempts: 3 }),
      expect.stringContaining('became reachable'),
    );
  });

  it('still fails closed when the worker never comes back', async () => {
    const fetchStub = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    vi.stubGlobal('fetch', fetchStub);
    const log = fakeLog();

    await expect(assertWorkerReachable(log, FAST)).rejects.toThrow(
      /FATAL: worker is not reachable .*after \d+ attempt\(s\).*fetch failed/,
    );
    // It did wait rather than giving up after one probe.
    expect(fetchStub.mock.calls.length).toBeGreaterThan(1);
    expect(log.warn).toHaveBeenCalled();
  });

  it('probes exactly once when the wait window is zero', async () => {
    const fetchStub = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    vi.stubGlobal('fetch', fetchStub);

    await expect(assertWorkerReachable(fakeLog(), { waitMs: 0 })).rejects.toThrow(/after 1 attempt/);
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it('passes but warns when the worker is up and its database check failed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse({ db: 'unreachable' })));
    const log = fakeLog();

    await expect(assertWorkerReachable(log, FAST)).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'worker_health' }),
      expect.stringContaining('database check failed'),
    );
  });
});
