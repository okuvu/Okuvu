import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initTRPC } from '@trpc/server';

// ─── Mock the real orchestrator + the A13/A15 worker adapter ───────────────
// pipeline-runner.ts / pipeline.ts import these via relative paths into
// apps/api/src/pipeline/orchestrator.js (mirrors singleAgent.test.ts's
// convention of mocking at the same specifier agent-adapter.ts itself uses).

const mockProcessTurn = vi.hoisted(() => vi.fn());
const mockInvokeAgent = vi.hoisted(() => vi.fn());

vi.mock('../../../api/src/pipeline/orchestrator.js', () => ({
  processTurn: mockProcessTurn,
}));

vi.mock('../lib/agent-adapter', () => ({
  invokeAgent: mockInvokeAgent,
}));

const mockUserUpsert = vi.hoisted(() => vi.fn());
const mockSessionLogCreate = vi.hoisted(() => vi.fn());
const mockSessionLogFindUnique = vi.hoisted(() => vi.fn());
const mockTestRunCreate = vi.hoisted(() => vi.fn());
const mockTestRunFindUnique = vi.hoisted(() => vi.fn());
const mockModelConfigPinFindFirst = vi.hoisted(() => vi.fn());
const mockTurnCount = vi.hoisted(() => vi.fn());
const mockSafetyStateFindUnique = vi.hoisted(() => vi.fn());

// `withEnvironment`/`withAnyEnvironment` (prisma-rls.ts) wrap every
// RLS-scoped table access in `prisma.$transaction(tx => ...)` + a `SET
// LOCAL` — the mock below routes both back to this same mocked `prisma`
// object so every existing per-table `vi.fn()` mock keeps working
// unchanged.
vi.mock('@/lib/prisma', () => {
  const mockPrisma: any = {
    user: { upsert: mockUserUpsert },
    sessionLog: { create: mockSessionLogCreate, findUnique: mockSessionLogFindUnique },
    testRun: { create: mockTestRunCreate, findUnique: mockTestRunFindUnique },
    modelConfigPin: { findFirst: mockModelConfigPinFindFirst },
    turn: { count: mockTurnCount },
    safetyState: { findUnique: mockSafetyStateFindUnique },
  };
  mockPrisma.$transaction = vi.fn((fn: any) => fn(mockPrisma));
  mockPrisma.$executeRawUnsafe = vi.fn();
  return { prisma: mockPrisma };
});

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

const { prisma } = await import('@/lib/prisma');
const { pipelineRouter } = await import('../server/routers/pipeline');

const t = initTRPC.context<any>().create();
const createCaller = t.createCallerFactory(pipelineRouter);

function buildCtx() {
  return {
    session: {
      user: { id: 'user-1', email: 'engineer@evia.dev', name: 'Engineer', role: 'ENGINEER', environments: ['sandbox'] },
    },
    user: { id: 'user-1', email: 'engineer@evia.dev', name: 'Engineer', role: 'ENGINEER', environments: ['sandbox'] },
    prisma,
  } as any;
}

const AGENT_TURN_RESULT = {
  type: 'agent_turn' as const,
  message: 'hi there',
  turnCount: 1,
  turnId: 'turn-1',
  timing: [
    { stage: 'A1', elapsedMs: 10 },
    { stage: 'A9_pre', elapsedMs: 12 },
    { stage: 'A8_router', elapsedMs: 1 },
    { stage: 'A2_response', elapsedMs: 200 },
    { stage: 'A9_post', elapsedMs: 15 },
  ],
  fallbackUsed: false,
  estimatedIntensity: 3,
  signals: [
    { boundary: 'A1_result', agent: 'A1', payload: 'S0', timestamp: '2026-01-01T00:00:00.000Z' },
    { boundary: 'A9_pre_result', agent: 'A9-pre', payload: 'Active', timestamp: '2026-01-01T00:00:00.000Z' },
    { boundary: 'A8_decision', agent: 'A8', payload: { agent: 'A2', mode: 'normal' }, timestamp: '2026-01-01T00:00:00.000Z' },
    { boundary: 'A2_result', agent: 'A2', payload: { userContent: 'hi there' }, timestamp: '2026-01-01T00:00:00.000Z' },
    { boundary: 'A9_post_result', agent: 'A9-post', payload: { decision: 'APPROVED' }, timestamp: '2026-01-01T00:00:00.000Z' },
  ],
};

const CRISIS_RESULT = {
  type: 'crisis' as const,
  timing: [
    { stage: 'A1', elapsedMs: 8 },
    { stage: 'A9_pre', elapsedMs: 9 },
    { stage: 'A8_router', elapsedMs: 1 },
  ],
  signals: [
    { boundary: 'A1_result', agent: 'A1', payload: 'S4', timestamp: '2026-01-01T00:00:00.000Z' },
    { boundary: 'A8_decision', agent: 'A8', payload: { agent: 'crisis' }, timestamp: '2026-01-01T00:00:00.000Z' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUserUpsert.mockResolvedValue({ id: 'db-user-1', firebase_uid: 'test-user-pipeline-1' });
  mockSessionLogCreate.mockResolvedValue({ id: 'session-1' });
  mockSessionLogFindUnique.mockResolvedValue(null);
  mockModelConfigPinFindFirst.mockResolvedValue(null);
  mockTurnCount.mockResolvedValue(0);
  mockSafetyStateFindUnique.mockResolvedValue(null);
  mockInvokeAgent.mockResolvedValue({
    output: { processed: true, combinedCall: true, note: 'combined' },
    latencyMs: 50,
    mockMode: true,
  });
});

describe('pipelineRouter.runFullPipeline', () => {
  it('runs processTurn with captureSignalBus and persists a TestRun with activated + manually-selected agents', async () => {
    mockProcessTurn.mockResolvedValue(AGENT_TURN_RESULT);
    mockTestRunCreate.mockResolvedValue({ id: 'run-1' });
    const caller = createCaller(buildCtx());

    const result = await caller.runFullPipeline({ message: 'hello', environment: 'sandbox' });

    expect(mockUserUpsert).toHaveBeenCalledTimes(1);
    expect(mockSessionLogCreate).toHaveBeenCalledTimes(1);
    expect(mockProcessTurn).toHaveBeenCalledTimes(1);
    const [, , , , opts] = mockProcessTurn.mock.calls[0];
    expect(opts.testMode.captureSignalBus).toBe(true);

    expect(mockInvokeAgent).toHaveBeenCalledTimes(1);
    expect(mockInvokeAgent.mock.calls[0][0]).toBe('A13');

    expect(mockTestRunCreate).toHaveBeenCalledTimes(1);
    const createArgs = mockTestRunCreate.mock.calls[0][0];
    expect(createArgs.data.environment).toBe('sandbox');
    expect(createArgs.data.status).toBe('pass');
    expect(createArgs.data.activated_agents).toEqual(
      expect.arrayContaining(['A1', 'A9-pre', 'A8', 'A2', 'A9-post', 'A13', 'A15']),
    );
    expect(createArgs.data.manually_selected_agents).toEqual(createArgs.data.activated_agents);
    expect(createArgs.data.results.signals).toEqual(AGENT_TURN_RESULT.signals);
    expect(createArgs.data.results.trace.length).toBeGreaterThan(0);

    expect(result.runId).toBe('run-1');
    expect(result.result).toEqual(AGENT_TURN_RESULT);
    expect(result.trace.length).toBeGreaterThan(0);
  });

  it('demotes status to "halt" when the pipeline result silently used a fallback', async () => {
    mockProcessTurn.mockResolvedValue({ ...AGENT_TURN_RESULT, fallbackUsed: true });
    mockTestRunCreate.mockResolvedValue({ id: 'run-halt-1' });
    const caller = createCaller(buildCtx());

    await caller.runFullPipeline({ message: 'hello', environment: 'sandbox' });

    const createArgs = mockTestRunCreate.mock.calls[0][0];
    expect(createArgs.data.status).toBe('halt');
    expect(createArgs.data.canned).toBe(false);
  });

  it('demotes status to "halt" when the signal bus violates a pipeline invariant (e.g. S4 that did not suppress)', async () => {
    mockProcessTurn.mockResolvedValue({
      ...AGENT_TURN_RESULT,
      signals: [
        { boundary: 'A1_result', agent: 'A1', payload: 'S4', timestamp: '2026-01-01T00:00:00.000Z' },
        { boundary: 'A9_pre_result', agent: 'A9-pre', payload: 'Active', timestamp: '2026-01-01T00:00:00.000Z' },
      ],
    });
    mockTestRunCreate.mockResolvedValue({ id: 'run-halt-invariant' });
    const caller = createCaller(buildCtx());

    const result = await caller.runFullPipeline({ message: 'hello', environment: 'sandbox' });

    expect(result.invariantViolations.map((v: { rule: string }) => v.rule)).toContain('full-suppression');
    const createArgs = mockTestRunCreate.mock.calls[0][0];
    expect(createArgs.data.status).toBe('halt');
  });

  it('demotes status to "halt" for a non-sandbox run when USE_CANNED_LLM_RESPONSE is ambiently set', async () => {
    mockProcessTurn.mockResolvedValue(AGENT_TURN_RESULT);
    mockTestRunCreate.mockResolvedValue({ id: 'run-halt-2' });
    const caller = createCaller(buildCtx());
    const previous = process.env.USE_CANNED_LLM_RESPONSE;
    process.env.USE_CANNED_LLM_RESPONSE = 'true';

    try {
      await caller.runFullPipeline({ message: 'hello', environment: 'staging' });
    } finally {
      if (previous === undefined) delete process.env.USE_CANNED_LLM_RESPONSE;
      else process.env.USE_CANNED_LLM_RESPONSE = previous;
    }

    const createArgs = mockTestRunCreate.mock.calls[0][0];
    expect(createArgs.data.status).toBe('halt');
    expect(createArgs.data.canned).toBe(true);
  });

  it('skips the A13/A15 worker call and does not include them in activated_agents on the crisis path', async () => {
    mockProcessTurn.mockResolvedValue(CRISIS_RESULT);
    mockTestRunCreate.mockResolvedValue({ id: 'run-2' });
    const caller = createCaller(buildCtx());

    await caller.runFullPipeline({ message: 'crisis probe', environment: 'sandbox' });

    expect(mockInvokeAgent).not.toHaveBeenCalled();
    const createArgs = mockTestRunCreate.mock.calls[0][0];
    expect(createArgs.data.activated_agents).not.toContain('A13');
    expect(createArgs.data.activated_agents).not.toContain('A15');
    expect(createArgs.data.activated_agents).toEqual(expect.arrayContaining(['A1', 'A9-pre', 'A8']));
  });
});

describe('pipelineRouter.overrideSignal', () => {
  it('passes testMode.signalOverride through for the supported a2_result boundary', async () => {
    mockProcessTurn.mockResolvedValue(AGENT_TURN_RESULT);
    const caller = createCaller(buildCtx());

    const result = await caller.overrideSignal({
      message: 'hi',
      environment: 'sandbox',
      boundary: 'a2_result',
      payload: { userContent: 'overridden' },
    });

    expect(mockProcessTurn).toHaveBeenCalledTimes(1);
    const [, , , , opts] = mockProcessTurn.mock.calls[0];
    expect(opts.testMode.signalOverride).toEqual({
      boundary: 'a2_result',
      payload: { userContent: 'overridden' },
    });
    expect(result.result).toEqual(AGENT_TURN_RESULT);
  });

  it('rejects an unsupported boundary with BAD_REQUEST', async () => {
    const caller = createCaller(buildCtx());

    await expect(
      caller.overrideSignal({
        message: 'hi',
        environment: 'sandbox',
        boundary: 'a1_result',
        payload: {},
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(mockProcessTurn).not.toHaveBeenCalled();
  });
});

describe('pipelineRouter.captureSignalBus', () => {
  it('reads the signals array back out of TestRun.results', async () => {
    mockTestRunFindUnique.mockResolvedValue({
      id: 'run-1',
      results: { signals: AGENT_TURN_RESULT.signals, trace: [] },
    });
    const caller = createCaller(buildCtx());

    const result = await caller.captureSignalBus({ runId: 'run-1' });

    expect(result.signals).toEqual(AGENT_TURN_RESULT.signals);
  });

  it('throws NOT_FOUND for an unknown runId', async () => {
    mockTestRunFindUnique.mockResolvedValue(null);
    const caller = createCaller(buildCtx());

    await expect(caller.captureSignalBus({ runId: 'nope' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('pipelineRouter.validateSilencePath', () => {
  it('returns PASS when processTurn resolves to the crisis silence path (no A2 output)', async () => {
    mockProcessTurn.mockResolvedValue(CRISIS_RESULT);
    const caller = createCaller(buildCtx());

    const result = await caller.validateSilencePath({ environment: 'sandbox' });

    expect(result.verdict).toBe('PASS');
    const [, , , , opts] = mockProcessTurn.mock.calls[0];
    expect(opts.testMode.injectA1).toBe('S4');
  });

  it('returns FAIL when processTurn resolves to agent_turn (A2 output exists)', async () => {
    mockProcessTurn.mockResolvedValue(AGENT_TURN_RESULT);
    const caller = createCaller(buildCtx());

    const result = await caller.validateSilencePath({ environment: 'sandbox' });

    expect(result.verdict).toBe('FAIL');
  });

  it('reports recordCompleteness:complete=false by default (the real, currently-unfixed persistence gap — mvp-v2-engineering-spec.md §5.2)', async () => {
    mockProcessTurn.mockResolvedValue(CRISIS_RESULT);
    const caller = createCaller(buildCtx());

    const result = await caller.validateSilencePath({ environment: 'sandbox' });

    // `verdict` (the routing-decision check) still passes — this doesn't
    // change what verdict has always meant.
    expect(result.verdict).toBe('PASS');
    expect(result.recordCompleteness).toEqual({
      turnPersisted: false,
      safetyStateUpdated: false,
      crisisFlagSet: false,
      complete: false,
    });
  });

  it('reports recordCompleteness:complete=true when the DB rows happen to be present', async () => {
    mockProcessTurn.mockResolvedValue(CRISIS_RESULT);
    mockTurnCount.mockResolvedValue(1);
    mockSafetyStateFindUnique.mockResolvedValue({ safety_state_current: 'S4' });
    mockSessionLogFindUnique.mockResolvedValue({ crisis_flag_detected: true });
    const caller = createCaller(buildCtx());

    const result = await caller.validateSilencePath({ environment: 'sandbox' });

    expect(result.recordCompleteness?.complete).toBe(true);
  });
});
