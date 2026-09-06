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

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { upsert: mockUserUpsert },
    sessionLog: { create: mockSessionLogCreate },
    testRun: { create: mockTestRunCreate },
    sessionSummary: { findFirst: mockSessionSummaryFindFirst },
  },
}));

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
