import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initTRPC } from '@trpc/server';

// ─── Mock the real orchestrator, session-close, and the A13/A15 worker
// adapter — same mocking convention as pipeline.test.ts: mock at the same
// relative specifier the router itself imports from.

const mockProcessTurn = vi.hoisted(() => vi.fn());
const mockCloseSession = vi.hoisted(() => vi.fn());
const mockInvokeAgent = vi.hoisted(() => vi.fn());

vi.mock('../../../api/src/pipeline/orchestrator.js', () => ({
  processTurn: mockProcessTurn,
}));

vi.mock('../../../api/src/lib/session-close.js', () => ({
  closeSession: mockCloseSession,
}));

vi.mock('../lib/agent-adapter', () => ({
  invokeAgent: mockInvokeAgent,
}));

const mockUserUpsert = vi.hoisted(() => vi.fn());
const mockSessionLogCreate = vi.hoisted(() => vi.fn());
const mockTestRunCreate = vi.hoisted(() => vi.fn());
const mockSessionSummaryFindFirst = vi.hoisted(() => vi.fn());
const mockModelConfigPinFindFirst = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => {
  const mockPrisma: any = {
    user: { upsert: mockUserUpsert },
    sessionLog: { create: mockSessionLogCreate },
    testRun: { create: mockTestRunCreate },
    sessionSummary: { findFirst: mockSessionSummaryFindFirst },
    modelConfigPin: { findFirst: mockModelConfigPinFindFirst },
  };
  mockPrisma.$transaction = vi.fn((fn: any) => fn(mockPrisma));
  mockPrisma.$executeRawUnsafe = vi.fn();
  return { prisma: mockPrisma };
});

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

const { prisma } = await import('@/lib/prisma');
const { conversationRouter } = await import('../server/routers/conversation');

const t = initTRPC.context<any>().create();
const createCaller = t.createCallerFactory(conversationRouter);

function buildCtx() {
  return {
    session: {
      user: { id: 'user-1', email: 'engineer@evia.dev', name: 'Engineer', role: 'ENGINEER', environments: ['sandbox'] },
    },
    user: { id: 'user-1', email: 'engineer@evia.dev', name: 'Engineer', role: 'ENGINEER', environments: ['sandbox'] },
    prisma,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUserUpsert.mockResolvedValue({ id: 'db-user-1', firebase_uid: 'test-user-pipeline-1' });
  mockSessionLogCreate.mockResolvedValue({ id: 'session-1' });
  mockModelConfigPinFindFirst.mockResolvedValue(null);
});

function agentTurn(message: string, fallbackUsed = false) {
  return {
    type: 'agent_turn' as const,
    message,
    turnCount: 1,
    turnId: 't1',
    timing: [],
    fallbackUsed,
    estimatedIntensity: null,
    signals: [{ boundary: 'A1_result', agent: 'A1', payload: 'S0', timestamp: '2026-01-01T00:00:00.000Z' }],
  };
}

const CRISIS_RESULT = {
  type: 'crisis' as const,
  timing: [],
  signals: [{ boundary: 'A1_result', agent: 'A1', payload: 'S4', timestamp: '2026-01-01T00:00:00.000Z' }],
};

describe('conversationRouter.runPersonaScript', () => {
  it('plays a built-in script to completion and persists a "pass" run in sandbox (canned:true)', async () => {
    let call = 0;
    mockProcessTurn.mockImplementation(() => Promise.resolve(agentTurn(`Reply number ${++call}.`)));
    mockTestRunCreate.mockResolvedValue({ id: 'run-1' });
    const caller = createCaller(buildCtx());

    const result = await caller.runPersonaScript({ personaId: 'anxious', environment: 'sandbox' });

    expect(mockProcessTurn).toHaveBeenCalledTimes(5); // 'anxious' script has 5 turns
    expect(result.endedInCrisis).toBe(false);
    const createArgs = mockTestRunCreate.mock.calls[0][0];
    expect(createArgs.data.status).toBe('pass');
    expect(createArgs.data.canned).toBe(true);
  });

  it('demotes status to "halt" when any turn silently used a fallback', async () => {
    mockProcessTurn
      .mockResolvedValueOnce(agentTurn('Reply one.'))
      .mockResolvedValueOnce(agentTurn('Reply two.', true))
      .mockResolvedValue(agentTurn('Reply three.'));
    mockTestRunCreate.mockResolvedValue({ id: 'run-2' });
    const caller = createCaller(buildCtx());

    const result = await caller.runPersonaScript({ personaId: 'anxious', environment: 'staging' });

    expect(result.turns[1].fallbackUsed).toBe(true);
    const createArgs = mockTestRunCreate.mock.calls[0][0];
    expect(createArgs.data.status).toBe('halt');
  });

  it('demotes status to "halt" for a non-sandbox run when USE_CANNED_LLM_RESPONSE is ambiently set', async () => {
    let call = 0;
    mockProcessTurn.mockImplementation(() => Promise.resolve(agentTurn(`Reply number ${++call}.`)));
    mockTestRunCreate.mockResolvedValue({ id: 'run-3' });
    const caller = createCaller(buildCtx());
    const previous = process.env.USE_CANNED_LLM_RESPONSE;
    process.env.USE_CANNED_LLM_RESPONSE = 'true';

    try {
      await caller.runPersonaScript({ personaId: 'fidelity', environment: 'staging' });
    } finally {
      if (previous === undefined) delete process.env.USE_CANNED_LLM_RESPONSE;
      else process.env.USE_CANNED_LLM_RESPONSE = previous;
    }

    const createArgs = mockTestRunCreate.mock.calls[0][0];
    expect(createArgs.data.status).toBe('halt');
    expect(createArgs.data.canned).toBe(true);
  });

  it('demotes status to "halt" when a turn violates a pipeline invariant (e.g. S4 that did not suppress)', async () => {
    mockProcessTurn
      .mockResolvedValueOnce({
        ...agentTurn('A normal-looking reply.'),
        signals: [
          { boundary: 'A1_result', agent: 'A1', payload: 'S4', timestamp: '2026-01-01T00:00:00.000Z' },
          { boundary: 'A9_pre_result', agent: 'A9-pre', payload: 'Active', timestamp: '2026-01-01T00:00:00.000Z' },
        ],
      })
      .mockResolvedValue(agentTurn('A later, unrelated reply.'));
    mockTestRunCreate.mockResolvedValue({ id: 'run-invariant' });
    const caller = createCaller(buildCtx());

    const result = await caller.runPersonaScript({ personaId: 'crisis-escalating', environment: 'staging' });

    expect(result.turns[0].invariantViolations.map((v: { rule: string }) => v.rule)).toContain(
      'full-suppression',
    );
    const createArgs = mockTestRunCreate.mock.calls[0][0];
    expect(createArgs.data.status).toBe('halt');
  });

  it('demotes status to "halt" when two consecutive turns produce an identical response (degenerate loop)', async () => {
    mockProcessTurn.mockResolvedValue(agentTurn('The exact same reply every time.'));
    mockTestRunCreate.mockResolvedValue({ id: 'run-4' });
    const caller = createCaller(buildCtx());

    const result = await caller.runPersonaScript({ personaId: 'adversarial', environment: 'staging' });

    expect(result.turns.every((t) => t.response === 'The exact same reply every time.')).toBe(true);
    const createArgs = mockTestRunCreate.mock.calls[0][0];
    expect(createArgs.data.status).toBe('halt');
  });

  it('stops early and sets endedInCrisis when a turn routes to the crisis silence path', async () => {
    mockProcessTurn.mockResolvedValueOnce(CRISIS_RESULT);
    mockTestRunCreate.mockResolvedValue({ id: 'run-5' });
    const caller = createCaller(buildCtx());

    const result = await caller.runPersonaScript({ personaId: 'crisis-escalating', environment: 'sandbox' });

    expect(mockProcessTurn).toHaveBeenCalledTimes(1);
    expect(result.endedInCrisis).toBe(true);
    expect(result.turns).toHaveLength(1);
    const createArgs = mockTestRunCreate.mock.calls[0][0];
    expect(createArgs.data.status).toBe('pass');
  });
});

describe('conversationRouter.simulateSessionClose', () => {
  it('closes the session via closeSession, triggers the A13/A15 worker call, and reports the SessionSummary row', async () => {
    mockCloseSession.mockResolvedValue({
      alreadyClosed: false,
      session_ended_at: '2026-01-01T00:00:00.000Z',
      reason: 'USER_REQUESTED',
      summaryEnqueued: false,
    });
    mockInvokeAgent.mockResolvedValue({
      output: { processed: true, combinedCall: true, note: 'combined' },
      latencyMs: 50,
      mockMode: true,
    });
    mockSessionSummaryFindFirst.mockResolvedValue({
      id: 'summary-1',
      session_id: 'session-1',
      user_id: 'db-user-1',
      status: 'DONE',
    });

    const caller = createCaller(buildCtx());
    const result = await caller.simulateSessionClose({
      sessionId: 'session-1',
      userId: 'test-user-pipeline-1',
      srsScore: 4,
    });

    expect(mockCloseSession).toHaveBeenCalledWith('session-1', 'test-user-pipeline-1', 'USER_REQUESTED');
    expect(mockInvokeAgent).toHaveBeenCalledTimes(1);
    expect(mockInvokeAgent).toHaveBeenCalledWith('A13', { sessionId: 'session-1', userId: 'test-user-pipeline-1' });
    expect(mockSessionSummaryFindFirst).toHaveBeenCalledWith({ where: { session_id: 'session-1' } });

    expect(result.closeResult.alreadyClosed).toBe(false);
    expect(result.summaryTriggered).toBe(true);
    expect(result.summaryRow).toEqual({
      id: 'summary-1',
      session_id: 'session-1',
      user_id: 'db-user-1',
      status: 'DONE',
    });
    expect(result.srsScore).toBe(4);
  });

  it('reports summaryTriggered: false when the worker call errors, but still returns closeResult', async () => {
    mockCloseSession.mockResolvedValue({
      alreadyClosed: false,
      session_ended_at: '2026-01-01T00:00:00.000Z',
      reason: 'USER_REQUESTED',
      summaryEnqueued: false,
    });
    mockInvokeAgent.mockResolvedValue({
      output: { processed: false, combinedCall: true, note: 'combined', error: 'WORKER_URL is not configured' },
      latencyMs: 5,
      mockMode: true,
    });
    mockSessionSummaryFindFirst.mockResolvedValue(null);

    const caller = createCaller(buildCtx());
    const result = await caller.simulateSessionClose({
      sessionId: 'session-2',
      userId: 'test-user-pipeline-2',
    });

    expect(result.summaryTriggered).toBe(false);
    expect(result.summaryRow).toBeNull();
    expect(result.srsScore).toBeNull();
  });
});
