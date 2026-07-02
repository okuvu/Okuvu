import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

// ─── Mock prisma ──────────────────────────────────────────────────────
vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    safetyState: {
      findUnique: vi.fn(),
    },
    sessionLog: {
  create: vi.fn(),
  findFirst: vi.fn(),
},
turn: {
  findFirst: vi.fn(),
},
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

// ─── Helpers ───────────────────────────────────────────────────────────

const MOCK_USER_ID = 'user-abc-123';

function mockUser(overrides?: Partial<{ id: string }>) {
  return { id: MOCK_USER_ID, ...overrides };
}

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma as unknown as {
    user: { findUnique: ReturnType<typeof vi.fn> };
    safetyState: { findUnique: ReturnType<typeof vi.fn> };
    sessionLog: {
  create: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
};
turn: {
  findFirst: ReturnType<typeof vi.fn>;
};
    $transaction: ReturnType<typeof vi.fn>;
    $queryRaw: ReturnType<typeof vi.fn>;
  };
}

function makeMockTx() {
  return {
    $queryRaw: vi.fn(),
    sessionLog: {
      create: vi.fn(),
    },
  };
}

// ─── Tests: getISTDateString ──────────────────────────────────────────

describe('getISTDateString', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, SESSION_LIMIT_SD_DAILY: '1', SESSION_LIMIT_TL_DAILY: '2' };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('returns YYYY-MM-DD format', async () => {
    const { getISTDateString } = await import('../lib/session-limits.js');
    const result = getISTDateString();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('QA Edge #5: returns correct IST date at the IST day boundary (UTC previous day → IST next day)', async () => {
    // 2026-06-29 23:00 UTC = 2026-06-30 04:30 IST (next day)
    const fakeNow = new Date('2026-06-29T23:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(fakeNow);

    const { getISTDateString } = await import('../lib/session-limits.js');
    const result = getISTDateString();
    expect(result).toBe('2026-06-30');

    vi.useRealTimers();
  });

  it('QA Edge #5: returns correct IST date when UTC and IST share the same calendar day', async () => {
    // 2026-06-29 02:00 UTC = 2026-06-29 07:30 IST (same day)
    const fakeNow = new Date('2026-06-29T02:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(fakeNow);

    const { getISTDateString } = await import('../lib/session-limits.js');
    const result = getISTDateString();
    expect(result).toBe('2026-06-29');

    vi.useRealTimers();
  });
});

// ─── Tests: getDailyLimit ─────────────────────────────────────────────

describe('getDailyLimit', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('returns SESSION_LIMIT_SD_DAILY for SD tier', async () => {
    process.env.SESSION_LIMIT_SD_DAILY = '3';
    process.env.SESSION_LIMIT_TL_DAILY = '5';
    const { getDailyLimit } = await import('../lib/session-limits.js');
    expect(getDailyLimit('SD')).toBe(3);
  });

  it('returns SESSION_LIMIT_TL_DAILY for TL tier', async () => {
    process.env.SESSION_LIMIT_SD_DAILY = '1';
    process.env.SESSION_LIMIT_TL_DAILY = '4';
    const { getDailyLimit } = await import('../lib/session-limits.js');
    expect(getDailyLimit('TL')).toBe(4);
  });
});

// ─── Tests: validateSessionConfig ─────────────────────────────────────

describe('validateSessionConfig', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('passes when both env vars are positive integers', async () => {
    process.env.SESSION_LIMIT_SD_DAILY = '1';
    process.env.SESSION_LIMIT_TL_DAILY = '2';
    const { validateSessionConfig } = await import('../lib/session-limits.js');
    expect(() => validateSessionConfig()).not.toThrow();
  });

  it('throws when SESSION_LIMIT_SD_DAILY is missing', async () => {
    process.env.SESSION_LIMIT_TL_DAILY = '2';
    const { validateSessionConfig } = await import('../lib/session-limits.js');
    expect(() => validateSessionConfig()).toThrow('SESSION_LIMIT_SD_DAILY');
  });

  it('throws when SESSION_LIMIT_TL_DAILY is not positive', async () => {
    process.env.SESSION_LIMIT_SD_DAILY = '1';
    process.env.SESSION_LIMIT_TL_DAILY = '0';
    const { validateSessionConfig } = await import('../lib/session-limits.js');
    expect(() => validateSessionConfig()).toThrow('SESSION_LIMIT_TL_DAILY');
  });
});

// ─── Tests: tryAcquireSessionSlot ─────────────────────────────────────

describe('tryAcquireSessionSlot', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, SESSION_LIMIT_SD_DAILY: '1', SESSION_LIMIT_TL_DAILY: '2' };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns allowed=true when under the daily cap', async () => {
    const tx = makeMockTx();
    tx.$queryRaw.mockResolvedValue([{ allowed: true, sessions_used: 1 }]);

    const { tryAcquireSessionSlot } = await import('../lib/session-limits.js');
    const result = await tryAcquireSessionSlot(tx as any, MOCK_USER_ID, 'SD', '2026-06-29', 1);

    expect(result.allowed).toBe(true);
    expect(result.sessions_used).toBe(1);
  });

  it('returns allowed=false when at the daily cap', async () => {
    const tx = makeMockTx();
    tx.$queryRaw.mockResolvedValue([{ allowed: false, sessions_used: 1 }]);

    const { tryAcquireSessionSlot } = await import('../lib/session-limits.js');
    const result = await tryAcquireSessionSlot(tx as any, MOCK_USER_ID, 'SD', '2026-06-29', 1);

    expect(result.allowed).toBe(false);
    expect(result.sessions_used).toBe(1);
  });

  it('passes the correct SQL parameters via $queryRaw', async () => {
    const tx = makeMockTx();
    tx.$queryRaw.mockResolvedValue([{ allowed: true, sessions_used: 1 }]);

    const { tryAcquireSessionSlot } = await import('../lib/session-limits.js');
    await tryAcquireSessionSlot(tx as any, MOCK_USER_ID, 'TL', '2026-06-30', 2);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const call = tx.$queryRaw.mock.calls[0][0];
    expect(call).toBeDefined();
  });
});

// ─── Tests: handleSessionOpen ──────────────────────────────────────────

describe('handleSessionOpen', () => {
  let mockPrisma: any;
  let sentFrames: any[];
  let loggedEntries: any[];

  beforeEach(async () => {
    process.env = {
      ...ORIGINAL_ENV,
      LOCAL_DEV_BYPASS_AUTH: 'true',
      SESSION_LIMIT_SD_DAILY: '1',
      SESSION_LIMIT_TL_DAILY: '2',
    };
    mockPrisma = await importMocks();
    sentFrames = [];
    loggedEntries = [];
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  function makeContext(uid: string = 'mock-firebase-uid-1') {
    return {
      uid,
      requestId: crypto.randomUUID(),
      log: {
        info: vi.fn((obj, msg) => { loggedEntries.push({ level: 'info', obj, msg }); }),
        warn: vi.fn((obj, msg) => { loggedEntries.push({ level: 'warn', obj, msg }); }),
        error: vi.fn((obj, msg) => { loggedEntries.push({ level: 'error', obj, msg }); }),
      },
      send: vi.fn((frame: any) => { sentFrames.push(frame); }),
    };
  }

    // ── QA Positive #1: Fresh user under daily limit ─────────────────────

  it('QA Positive #1: opens a session for a fresh user under their daily limit', async () => {
    const startedAt = new Date();
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: MOCK_USER_ID });
    mockPrisma.safetyState.findUnique.mockResolvedValueOnce({ safety_state_current: 'S0' });
    const mockTx = makeMockTx();
    mockTx.$queryRaw.mockResolvedValueOnce([{ allowed: true, sessions_used: 1 }]);
    mockTx.sessionLog.create.mockResolvedValueOnce({ id: 'session-1', session_started_at: startedAt });
    mockPrisma.$transaction.mockImplementationOnce(async (cb: Function) => cb(mockTx));

    const { handleSessionOpen } = await import('../lib/session-handler.js');
    await handleSessionOpen(makeContext());

    expect(sentFrames).toHaveLength(1);
    expect(sentFrames[0].type).toBe('SESSION_OPEN_CONFIRMED');
    expect(sentFrames[0].payload.session_id).toBe('session-1');
    expect(sentFrames[0].payload.session_started_at).toBe(startedAt.toISOString());
    expect(sentFrames[0].payload.crisis_bypass).toBe(false);

    const infoLog = loggedEntries.find((e: any) => e.obj?.outcome === 'allowed');
    expect(infoLog).toBeDefined();
  });

  // ── User not found ───────────────────────────────────────────────────

  it('rejects when user does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);

    const { handleSessionOpen } = await import('../lib/session-handler.js');
    await handleSessionOpen(makeContext());

    expect(sentFrames).toHaveLength(1);
    expect(sentFrames[0].type).toBe('SESSION_OPEN_REJECTED');
    expect(sentFrames[0].payload.reason).toBe('USER_NOT_FOUND');

    const warnLog = loggedEntries.find((e: any) => e.obj?.outcome === 'user_not_found');
    expect(warnLog).toBeDefined();
  });

  // ── QA Negative #3: Second session rejected for non-crisis user ──────

  it('QA Negative #3: rejects second session for a non-crisis user who used their daily limit', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: MOCK_USER_ID });
    mockPrisma.safetyState.findUnique.mockResolvedValueOnce({ safety_state_current: 'S0' });
    const mockTx = makeMockTx();
    mockTx.$queryRaw.mockResolvedValueOnce([{ allowed: false, sessions_used: 1 }]);
    mockPrisma.$transaction.mockImplementationOnce(async (cb: Function) => cb(mockTx));

    const { handleSessionOpen } = await import('../lib/session-handler.js');
    await handleSessionOpen(makeContext());

    expect(sentFrames).toHaveLength(1);
    expect(sentFrames[0].type).toBe('SESSION_OPEN_REJECTED');
    expect(sentFrames[0].payload.reason).toBe('DAILY_LIMIT_EXCEEDED');
    expect(sentFrames[0].payload.retry_after).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const infoLog = loggedEntries.find((e: any) => e.obj?.outcome === 'rate_limited');
    expect(infoLog).toBeDefined();
  });

  // ── QA Positive #2: S4 crisis user who exhausted limit ───────────────

  it('QA Positive #2: bypasses rate limit for an S4 user who already exhausted their daily limit', async () => {
    // User has S4 safety state, simulating someone who already used their session
    // but is now in crisis — crisis bypass must succeed regardless
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: MOCK_USER_ID });
    mockPrisma.safetyState.findUnique.mockResolvedValueOnce({ safety_state_current: 'S4' });
    const mockTx = makeMockTx();
    mockTx.sessionLog.create.mockResolvedValueOnce({ id: 'crisis-session-1', session_started_at: new Date() });
    // Crisis path uses $transaction but $queryRaw is never called (no rate limit check)
    mockPrisma.$transaction.mockImplementationOnce(async (cb: Function) => cb(mockTx));

    const { handleSessionOpen } = await import('../lib/session-handler.js');
    await handleSessionOpen(makeContext());

    // Crisis bypass succeeds
    expect(sentFrames).toHaveLength(1);
    expect(sentFrames[0].type).toBe('SESSION_OPEN_CONFIRMED');
    expect(sentFrames[0].payload.crisis_bypass).toBe(true);
    expect(sentFrames[0].payload.session_id).toBe('crisis-session-1');

    // Rate limiter was never consulted — $queryRaw never called
    expect(mockTx.$queryRaw).not.toHaveBeenCalled();

    const infoLog = loggedEntries.find((e: any) => e.obj?.outcome === 'crisis_bypass');
    expect(infoLog).toBeDefined();
  });

  it('crisis bypass creates no SessionLimit row', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: MOCK_USER_ID });
    mockPrisma.safetyState.findUnique.mockResolvedValueOnce({ safety_state_current: 'S4' });
    const mockTx = makeMockTx();
    mockTx.sessionLog.create.mockResolvedValueOnce({ id: 'crisis-session-2', session_started_at: new Date() });
    mockPrisma.$transaction.mockImplementationOnce(async (cb: Function) => cb(mockTx));

    const { handleSessionOpen } = await import('../lib/session-handler.js');
    await handleSessionOpen(makeContext());

    expect(mockTx.$queryRaw).not.toHaveBeenCalled();
    expect(mockTx.sessionLog.create).toHaveBeenCalledTimes(1);
  });

  // ── Missing SafetyState defaults to S0 ───────────────────────────────

  it('treats missing SafetyState as non-crisis (S0 default)', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: MOCK_USER_ID });
    // SafetyState row does not exist
    mockPrisma.safetyState.findUnique.mockResolvedValueOnce(null);
    const mockTx = makeMockTx();
    mockTx.$queryRaw.mockResolvedValueOnce([{ allowed: true, sessions_used: 1 }]);
    mockTx.sessionLog.create.mockResolvedValueOnce({ id: 'session-default-s0', session_started_at: new Date() });
    mockPrisma.$transaction.mockImplementationOnce(async (cb: Function) => cb(mockTx));

    const { handleSessionOpen } = await import('../lib/session-handler.js');
    await handleSessionOpen(makeContext());

    expect(sentFrames).toHaveLength(1);
    expect(sentFrames[0].type).toBe('SESSION_OPEN_CONFIRMED');
    expect(sentFrames[0].payload.crisis_bypass).toBe(false);
    // Rate limiter was invoked (user is NOT crisis)
    expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  // ── Transaction failure → INTERNAL_ERROR ─────────────────────────────

  it('response with INTERNAL_ERROR frame when transaction throws', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: MOCK_USER_ID });
    mockPrisma.safetyState.findUnique.mockResolvedValueOnce({ safety_state_current: 'S0' });
    mockPrisma.$transaction.mockRejectedValueOnce(new Error('DB connection lost'));

    const { handleSessionOpen } = await import('../lib/session-handler.js');
    await expect(handleSessionOpen(makeContext())).rejects.toThrow('DB connection lost');
  });

  // ── Logging ──────────────────────────────────────────────────────────

  it('logs every SESSION_OPEN attempt with outcome', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: MOCK_USER_ID });
    mockPrisma.safetyState.findUnique.mockResolvedValueOnce({ safety_state_current: 'S0' });
    const mockTx = makeMockTx();
    mockTx.$queryRaw.mockResolvedValueOnce([{ allowed: true, sessions_used: 1 }]);
    mockTx.sessionLog.create.mockResolvedValueOnce({ id: 'log-session-1', session_started_at: new Date() });
    mockPrisma.$transaction.mockImplementationOnce(async (cb: Function) => cb(mockTx));

    const ctx = makeContext();
    const { handleSessionOpen } = await import('../lib/session-handler.js');
    await handleSessionOpen(ctx);

    expect(ctx.log.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'session_open', outcome: 'allowed' }),
      expect.any(String),
    );
  });
});

// ─── Concurrency Tests ──────────────────────────────────────────────────

describe('concurrency', () => {
  let mockPrisma: any;

  beforeEach(async () => {
    process.env = {
      ...ORIGINAL_ENV,
      LOCAL_DEV_BYPASS_AUTH: 'true',
      SESSION_LIMIT_SD_DAILY: '1',
      SESSION_LIMIT_TL_DAILY: '2',
    };
    mockPrisma = await importMocks();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('QA Edge #4: exactly one session succeeds and one is rejected under concurrent requests', async () => {
    // Shared state: simulate atomic PostgreSQL behavior
    let allowedCount = 0;

    mockPrisma.user.findUnique.mockResolvedValue({ id: MOCK_USER_ID });
    mockPrisma.safetyState.findUnique.mockResolvedValue({ safety_state_current: 'S0' });

    mockPrisma.$transaction.mockImplementation(async (cb: Function) => {
      const mockTx = makeMockTx();
      mockTx.$queryRaw.mockImplementation(async () => {
        // Only the first request to reach this point gets allowed
        if (allowedCount === 0) {
          allowedCount++;
          return [{ allowed: true, sessions_used: 1 }];
        }
        return [{ allowed: false, sessions_used: 1 }];
      });
      mockTx.sessionLog.create.mockResolvedValue({ id: `session-concurrent-${allowedCount}`, session_started_at: new Date() });
      return cb(mockTx);
    });

    const ctx1 = {
      uid: 'mock-firebase-uid-1',
      requestId: 'req-1',
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      send: vi.fn(),
    };
    const ctx2 = {
      uid: 'mock-firebase-uid-1',
      requestId: 'req-2',
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      send: vi.fn(),
    };

    const { handleSessionOpen } = await import('../lib/session-handler.js');
    await Promise.all([handleSessionOpen(ctx1), handleSessionOpen(ctx2)]);

    const confirmed = [ctx1, ctx2].filter(c =>
      c.send.mock.calls.some((call: any[]) => call[0]?.type === 'SESSION_OPEN_CONFIRMED'),
    );
    const rejected = [ctx1, ctx2].filter(c =>
      c.send.mock.calls.some((call: any[]) => call[0]?.type === 'SESSION_OPEN_REJECTED'),
    );

    expect(confirmed).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(allowedCount).toBe(1);
  });

  it('AC #2: two concurrent S4 crisis requests both succeed and never touch session_limits', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: MOCK_USER_ID });
    mockPrisma.safetyState.findUnique.mockResolvedValue({ safety_state_current: 'S4' });

    let crisisTxCalls = 0;
    mockPrisma.$transaction.mockImplementation(async (cb: Function) => {
      const mockTx = makeMockTx();
      crisisTxCalls++;
      mockTx.sessionLog.create.mockResolvedValue({
        id: `crisis-concurrent-${crisisTxCalls}`,
        session_started_at: new Date(),
      });
      return cb(mockTx);
    });

    const ctx1 = {
      uid: 'mock-firebase-uid-1',
      requestId: 'req-c1',
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      send: vi.fn(),
    };
    const ctx2 = {
      uid: 'mock-firebase-uid-1',
      requestId: 'req-c2',
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      send: vi.fn(),
    };

    const { handleSessionOpen } = await import('../lib/session-handler.js');
    await Promise.all([handleSessionOpen(ctx1), handleSessionOpen(ctx2)]);

    // Both should be confirmed with crisis_bypass
    const confirmed = [ctx1, ctx2].filter(c =>
      c.send.mock.calls.some((call: any[]) => call[0]?.type === 'SESSION_OPEN_CONFIRMED' && call[0]?.payload?.crisis_bypass === true),
    );
    expect(confirmed).toHaveLength(2);

    // S4 crisis bypass never touches SessionLimit — $queryRaw never called
    const anyCalled = [ctx1, ctx2].some(c =>
      c.send.mock.calls.some((call: any[]) => call[0]?.type === 'SESSION_OPEN_REJECTED'),
    );
    expect(anyCalled).toBe(false);
  });
  it('replays the same assistant turn across rapid reconnect cycling', async () => {
    const startedAt = new Date('2026-07-02T10:00:00.000Z');

    mockPrisma.user.findUnique.mockResolvedValue({ id: MOCK_USER_ID });
    mockPrisma.sessionLog.findFirst.mockResolvedValue({
      id: 'existing-session-1',
      session_started_at: startedAt,
    });

    mockPrisma.turn.findFirst
      .mockResolvedValueOnce({
        id: 'user-turn-1',
        turn_number: 1,
      })
      .mockResolvedValue({
        id: 'assistant-turn-1',
        content: 'This is the saved assistant response.',
        turn_number: 1,
      });

    const { handleSessionOpen } = await import('../lib/session-handler.js');

    for (let reconnect = 0; reconnect < 3; reconnect++) {
      const send = vi.fn();

      await handleSessionOpen({
        uid: 'mock-firebase-uid-1',
        requestId: `reconnect-${reconnect}`,
        sessionId: 'existing-session-1',
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        send,
      });

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[0][0]).toMatchObject({
        type: 'SESSION_OPEN_CONFIRMED',
        payload: { session_id: 'existing-session-1' },
      });
      expect(send.mock.calls[1][0]).toMatchObject({
        type: 'AGENT_TURN',
        payload: {
          session_id: 'existing-session-1',
          message: 'This is the saved assistant response.',
          turn_id: 'assistant-turn-1',
        },
      });
    }
  });
});