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
  },
}));

// ─── Helpers ───────────────────────────────────────────────────────────

const MOCK_USER_ID = 'user-abc-123';

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
  };
}

// ─── Tests: handleSessionOpen ──────────────────────────────────────────

describe('handleSessionOpen', () => {
  let mockPrisma: any;
  let sentFrames: any[];
  let loggedEntries: any[];

  beforeEach(async () => {
    process.env = {
      ...ORIGINAL_ENV,
      LOCAL_DEV_BYPASS_AUTH: 'true',
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

  it('opens a session for a fresh user', async () => {
    const startedAt = new Date();
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: MOCK_USER_ID });
    mockPrisma.safetyState.findUnique.mockResolvedValueOnce({ safety_state_current: 'S0' });
    mockPrisma.sessionLog.create.mockResolvedValueOnce({ id: 'session-1', session_started_at: startedAt });

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

  it('opens a session for a crisis (S4) user', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: MOCK_USER_ID });
    mockPrisma.safetyState.findUnique.mockResolvedValueOnce({ safety_state_current: 'S4' });
    mockPrisma.sessionLog.create.mockResolvedValueOnce({ id: 'crisis-session-1', session_started_at: new Date() });

    const { handleSessionOpen } = await import('../lib/session-handler.js');
    await handleSessionOpen(makeContext());

    expect(sentFrames).toHaveLength(1);
    expect(sentFrames[0].type).toBe('SESSION_OPEN_CONFIRMED');
    expect(sentFrames[0].payload.crisis_bypass).toBe(true);
    expect(sentFrames[0].payload.session_id).toBe('crisis-session-1');

    const infoLog = loggedEntries.find((e: any) => e.obj?.outcome === 'crisis_bypass');
    expect(infoLog).toBeDefined();
  });

  // ── Missing SafetyState defaults to S0 ───────────────────────────────

  it('treats missing SafetyState as non-crisis (S0 default)', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: MOCK_USER_ID });
    // SafetyState row does not exist
    mockPrisma.safetyState.findUnique.mockResolvedValueOnce(null);
    mockPrisma.sessionLog.create.mockResolvedValueOnce({ id: 'session-default-s0', session_started_at: new Date() });

    const { handleSessionOpen } = await import('../lib/session-handler.js');
    await handleSessionOpen(makeContext());

    expect(sentFrames).toHaveLength(1);
    expect(sentFrames[0].type).toBe('SESSION_OPEN_CONFIRMED');
    expect(sentFrames[0].payload.crisis_bypass).toBe(false);
  });

  // ── sessionLog.create failure → INTERNAL_ERROR ────────────────────────

  it('throws when sessionLog.create fails', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: MOCK_USER_ID });
    mockPrisma.safetyState.findUnique.mockResolvedValueOnce({ safety_state_current: 'S0' });
    mockPrisma.sessionLog.create.mockRejectedValueOnce(new Error('DB connection lost'));

    const { handleSessionOpen } = await import('../lib/session-handler.js');
    await expect(handleSessionOpen(makeContext())).rejects.toThrow('DB connection lost');
  });

  // ── Logging ──────────────────────────────────────────────────────────

  it('logs every SESSION_OPEN attempt with outcome', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: MOCK_USER_ID });
    mockPrisma.safetyState.findUnique.mockResolvedValueOnce({ safety_state_current: 'S0' });
    mockPrisma.sessionLog.create.mockResolvedValueOnce({ id: 'log-session-1', session_started_at: new Date() });

    const ctx = makeContext();
    const { handleSessionOpen } = await import('../lib/session-handler.js');
    await handleSessionOpen(ctx);

    expect(ctx.log.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'session_open', outcome: 'allowed' }),
      expect.any(String),
    );
  });
});

// ─── Concurrency / Reconnect Tests ───────────────────────────────────────

describe('concurrency', () => {
  let mockPrisma: any;

  beforeEach(async () => {
    process.env = {
      ...ORIGINAL_ENV,
      LOCAL_DEV_BYPASS_AUTH: 'true',
    };
    mockPrisma = await importMocks();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
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
