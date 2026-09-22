import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/redis.js', () => ({
  getRedisClient: vi.fn(),
}));

import { getRedisClient } from '../lib/redis.js';
import { checkRateLimit } from '../lib/rate-limit.js';

function fakeRedis(overrides: Partial<{ incr: (key: string) => Promise<number>; expire: (key: string, seconds: number) => Promise<number> }> = {}) {
  return {
    incr: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('checkRateLimit', () => {
  it('allows the request when the count is under max', async () => {
    const redis = fakeRedis({ incr: vi.fn(async () => 3) });
    vi.mocked(getRedisClient).mockReturnValue(redis as never);

    const allowed = await checkRateLimit('k', 5, 60);

    expect(allowed).toBe(true);
  });

  it('allows the request when the count equals max', async () => {
    const redis = fakeRedis({ incr: vi.fn(async () => 5) });
    vi.mocked(getRedisClient).mockReturnValue(redis as never);

    const allowed = await checkRateLimit('k', 5, 60);

    expect(allowed).toBe(true);
  });

  it('rejects the request once the count exceeds max', async () => {
    const redis = fakeRedis({ incr: vi.fn(async () => 6) });
    vi.mocked(getRedisClient).mockReturnValue(redis as never);

    const allowed = await checkRateLimit('k', 5, 60);

    expect(allowed).toBe(false);
  });

  it('sets an expiry only on the first hit in a window', async () => {
    const redis = fakeRedis({ incr: vi.fn(async () => 1) });
    vi.mocked(getRedisClient).mockReturnValue(redis as never);

    await checkRateLimit('k', 5, 60);

    expect(redis.expire).toHaveBeenCalledWith('k', 60);
  });

  it('does not re-set expiry on subsequent hits in the same window', async () => {
    const redis = fakeRedis({ incr: vi.fn(async () => 2) });
    vi.mocked(getRedisClient).mockReturnValue(redis as never);

    await checkRateLimit('k', 5, 60);

    expect(redis.expire).not.toHaveBeenCalled();
  });

  it('fails open (allows the request) when Redis is not configured', async () => {
    vi.mocked(getRedisClient).mockReturnValue(null);

    const allowed = await checkRateLimit('k', 5, 60);

    expect(allowed).toBe(true);
  });

  it('fails open (allows the request) when Redis throws', async () => {
    const redis = fakeRedis({ incr: vi.fn(async () => { throw new Error('connection reset'); }) });
    vi.mocked(getRedisClient).mockReturnValue(redis as never);

    const allowed = await checkRateLimit('k', 5, 60);

    expect(allowed).toBe(true);
  });
});
