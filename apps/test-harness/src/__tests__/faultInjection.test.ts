import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initTRPC } from '@trpc/server';

// ─── Mock apps/api's orchestrator + fallbacks ───────────────────────────────
// faultInjection.ts imports these via relative paths into apps/api/src/pipeline.
// We mock at those same specifiers (resolved to the same absolute files) so
// no real pipeline/Vertex AI call ever happens in this test file.

const mockProcessTurn = vi.hoisted(() => vi.fn());

vi.mock('../../../api/src/pipeline/orchestrator.js', () => ({
  processTurn: mockProcessTurn,
}));
vi.mock('../../../api/src/pipeline/fallbacks.js', () => ({
  A2_DEGRADED_RESPONSE: 'A2_DEGRADED_RESPONSE_SENTINEL',
  A9_POST_DEGRADED_RESPONSE: 'A9_POST_DEGRADED_RESPONSE_SENTINEL',
  A9_POST_S2_FALLBACK: 'A9_POST_S2_FALLBACK_SENTINEL',
  getSafeFallback: vi.fn(),
}));

// `withEnvironment` (prisma-rls.ts) wraps every RLS-scoped table access in
// `prisma.$transaction(tx => ...)` + a `SET LOCAL` — the mock below routes
// both back to this same mocked `prisma` object so every existing
// per-table `vi.fn()` mock keeps working unchanged.
vi.mock('@/lib/prisma', () => {
  const mockPrisma: any = {
    user: { upsert: vi.fn() },
    sessionLog: { create: vi.fn() },
    testRun: { create: vi.fn() },
    governanceLog: { findFirst: vi.fn() },
  };
  mockPrisma.$transaction = vi.fn((fn: any) => fn(mockPrisma));
  mockPrisma.$executeRawUnsafe = vi.fn();
  return { prisma: mockPrisma };
});

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

const { prisma } = await import('@/lib/prisma');
const { faultInjectionRouter } = await import('../server/routers/faultInjection');
const { A2_DEGRADED_RESPONSE } = await import('../../../api/src/pipeline/fallbacks.js');

const t = initTRPC.context<any>().create();
const createCaller = t.createCallerFactory(faultInjectionRouter);

function buildCtx() {
  return {
    session: {
      user: {
        id: 'user-1',
        email: 'engineer@evia.dev',
        name: 'Engineer',
        role: 'ENGINEER',
        environments: ['sandbox', 'staging', 'beta'],
      },
    },
    user: {
      id: 'user-1',
      email: 'engineer@evia.dev',
      name: 'Engineer',
      role: 'ENGINEER',
      environments: ['sandbox', 'staging', 'beta'],
    },
    prisma,
  } as any;
}

function mockUserAndSession(userId = 'db-user-1', sessionId = 'session-1') {
  (prisma!.user.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: userId,
    firebase_uid: `test-user-fault-x-${userId}`,
  });
  (prisma!.sessionLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: sessionId });
  (prisma!.testRun.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'run-1' });
}

describe('faultInjectionRouter.injectModelFailure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['A1', 'A2', 'A9_pre', 'A9_post'] as const)(
    'calls processTurn with testMode.faults for boundary %s and no other fault-shaping options',
    async (boundary) => {
      mockUserAndSession();
      mockProcessTurn.mockResolvedValue({
        type: 'agent_turn',
        message: 'hi',
        turnCount: 1,
        turnId: 't1',
        timing: [],
        fallbackUsed: false,
        estimatedIntensity: null,
      });

      const caller = createCaller(buildCtx());
      await caller.injectModelFailure({
        boundary,
        type: 'timeout',
        message: 'hello',
        environment: 'sandbox',
      });

      expect(mockProcessTurn).toHaveBeenCalledTimes(1);
      const [uid, sessionId, message, perceivedIntensity, opts] = mockProcessTurn.mock.calls[0];
      expect(uid).toMatch(/^test-user-fault-model-/);
      expect(sessionId).toBe('session-1');
      expect(message).toBe('hello');
      expect(perceivedIntensity).toBeNull();
      expect(opts.testMode.faults).toEqual({ boundary, type: 'timeout' });
      // No unrelated injection options should be set — this call must only
      // ever inject the one requested fault, never always-on injection.
      expect(opts.testMode.injectA1).toBeUndefined();
      expect(opts.testMode.injectA9).toBeUndefined();
      expect(opts.testMode.injectRouter).toBeUndefined();
      expect(opts.testMode.signalOverride).toBeUndefined();
    },
  );

  it('persists a TestRun row with the fault config recorded in dependency_graph', async () => {
    mockUserAndSession();
    mockProcessTurn.mockResolvedValue({
      type: 'agent_turn',
      message: A2_DEGRADED_RESPONSE,
      turnCount: 1,
      turnId: 't1',
      timing: [],
      fallbackUsed: true,
      estimatedIntensity: null,
    });

    const caller = createCaller(buildCtx());
    const { runId } = await caller.injectModelFailure({
      boundary: 'A2',
      type: 'api_error',
      message: 'hello',
      environment: 'staging',
    });

    expect(runId).toBe('run-1');
    expect(prisma!.testRun.create).toHaveBeenCalledTimes(1);
    const createArgs = (prisma!.testRun.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createArgs.data.environment).toBe('staging');
    expect(createArgs.data.status).toBe('warning'); // fallbackUsed => warning
    expect(createArgs.data.dependency_graph).toEqual({
      fault: { kind: 'model_failure', boundary: 'A2', type: 'api_error' },
    });
  });

  it('marks status "error" when the pipeline result type is "error"', async () => {
    mockUserAndSession();
    mockProcessTurn.mockResolvedValue({ type: 'error', errorCode: 'USER_NOT_FOUND', timing: [] });

    const caller = createCaller(buildCtx());
    await caller.injectModelFailure({
      boundary: 'A1',
      type: 'timeout',
      message: 'hello',
      environment: 'sandbox',
    });

    const createArgs = (prisma!.testRun.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createArgs.data.status).toBe('error');
  });
});

describe('faultInjectionRouter.injectSignalFailure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls processTurn with signalOverride nulling A2 signal, and no faults set (normal path unaffected)', async () => {
    mockUserAndSession();
    mockProcessTurn.mockResolvedValue({
      type: 'agent_turn',
      message: 'hi',
      turnCount: 1,
      turnId: 't1',
      timing: [],
      fallbackUsed: false,
      estimatedIntensity: null,
    });

    const caller = createCaller(buildCtx());
    await caller.injectSignalFailure({ message: 'hello', environment: 'beta' });

    expect(mockProcessTurn).toHaveBeenCalledTimes(1);
    const [, , , , opts] = mockProcessTurn.mock.calls[0];
    expect(opts.testMode.signalOverride).toEqual({ boundary: 'a2_result', payload: { signal: null } });
    // This is a signal-drop fault, not a boundary-failure fault — faults
    // must NOT be set for this call.
    expect(opts.testMode.faults).toBeUndefined();
  });
});

describe('faultInjectionRouter.verifyFailSafe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns PASS for all 3 assertions when the pipeline behaves per the documented fail-safes', async () => {
    mockUserAndSession();

    // Assertion 1: A1 failure -> S2 fallback, surfaced via captureSignalBus.
    mockProcessTurn.mockResolvedValueOnce({
      type: 'agent_turn',
      message: 'ok',
      turnCount: 1,
      turnId: 't1',
      timing: [],
      fallbackUsed: false,
      estimatedIntensity: null,
      signals: [{ boundary: 'A1_result', agent: 'A1', payload: 'S2', timestamp: 'now' }],
    });

    // Assertion 2: A2 failure -> A2_DEGRADED_RESPONSE, fallbackUsed true.
    mockProcessTurn.mockResolvedValueOnce({
      type: 'agent_turn',
      message: A2_DEGRADED_RESPONSE,
      turnCount: 1,
      turnId: 't2',
      timing: [],
      fallbackUsed: true,
      estimatedIntensity: null,
    });

    // Assertion 3: A9-post failure at S2 -> fallback text (GovernanceLog checked separately).
    mockProcessTurn.mockResolvedValueOnce({
      type: 'agent_turn',
      message: 'fallback text',
      turnCount: 1,
      turnId: 't3',
      timing: [],
      fallbackUsed: false,
      estimatedIntensity: null,
    });

    (prisma!.governanceLog.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'gl-1',
      violation_type: 'a9_post_unavailable_s2',
      decision: 'BLOCKED',
    });

    const caller = createCaller(buildCtx());
    const result = await caller.verifyFailSafe({});

    expect(result.assertion1).toBe('PASS');
    expect(result.assertion2).toBe('PASS');
    expect(result.assertion3).toBe('PASS');

    expect(mockProcessTurn).toHaveBeenCalledTimes(3);
    // Call 1: A1 fault only.
    expect(mockProcessTurn.mock.calls[0][4].testMode.faults).toEqual({ boundary: 'A1', type: 'timeout' });
    // Call 2: A2 fault only.
    expect(mockProcessTurn.mock.calls[1][4].testMode.faults).toEqual({ boundary: 'A2', type: 'api_error' });
    // Call 3: A9_post fault + injectA1 'S2' together (this is the exact
    // condition orchestrator.ts's A9-post catch block checks for).
    expect(mockProcessTurn.mock.calls[2][4].testMode.faults).toEqual({ boundary: 'A9_post', type: 'api_error' });
    expect(mockProcessTurn.mock.calls[2][4].testMode.injectA1).toBe('S2');

    expect(prisma!.governanceLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ gate: 'A9-POST', decision: 'BLOCKED' }),
      }),
    );
  });

  it('returns FAIL for an assertion when its expected condition is not met', async () => {
    mockUserAndSession();

    // Assertion 1 fails: A1 result payload is not 'S2'.
    mockProcessTurn.mockResolvedValueOnce({
      type: 'agent_turn',
      message: 'ok',
      turnCount: 1,
      turnId: 't1',
      timing: [],
      fallbackUsed: false,
      estimatedIntensity: null,
      signals: [{ boundary: 'A1_result', agent: 'A1', payload: 'S0', timestamp: 'now' }],
    });

    // Assertion 2 fails: message isn't the degraded response.
    mockProcessTurn.mockResolvedValueOnce({
      type: 'agent_turn',
      message: 'some other text',
      turnCount: 1,
      turnId: 't2',
      timing: [],
      fallbackUsed: false,
      estimatedIntensity: null,
    });

    mockProcessTurn.mockResolvedValueOnce({
      type: 'agent_turn',
      message: 'fallback text',
      turnCount: 1,
      turnId: 't3',
      timing: [],
      fallbackUsed: false,
      estimatedIntensity: null,
    });

    // Assertion 3 fails: no matching GovernanceLog row.
    (prisma!.governanceLog.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const caller = createCaller(buildCtx());
    const result = await caller.verifyFailSafe({});

    expect(result.assertion1).toBe('FAIL');
    expect(result.assertion2).toBe('FAIL');
    expect(result.assertion3).toBe('FAIL');
  });
});
