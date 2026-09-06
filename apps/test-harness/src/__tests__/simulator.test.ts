import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initTRPC } from '@trpc/server';

// ─── Mock the real orchestrator — same convention as pipeline.test.ts /
// conversation.test.ts: mock at the same relative specifier the router
// itself imports from.
const mockProcessTurn = vi.hoisted(() => vi.fn());

vi.mock('../../../api/src/pipeline/orchestrator.js', () => ({
  processTurn: mockProcessTurn,
}));

const mockUserUpsert = vi.hoisted(() => vi.fn());
const mockSessionLogCreate = vi.hoisted(() => vi.fn());
const mockTestRunCreate = vi.hoisted(() => vi.fn());
const mockTestRunFindUniqueOrThrow = vi.hoisted(() => vi.fn());
const mockTestRunUpdate = vi.hoisted(() => vi.fn());

// `withEnvironment` (prisma-rls.ts) wraps every RLS-scoped table access in
// `prisma.$transaction(tx => ...)` + a `SET LOCAL` — the mock below routes
// both back to this same mocked `prisma` object so every per-table
// `vi.fn()` mock keeps working unchanged.
vi.mock('@/lib/prisma', () => {
  const mockPrisma: any = {
    user: { upsert: mockUserUpsert },
    sessionLog: { create: mockSessionLogCreate },
    testRun: {
      create: mockTestRunCreate,
      findUniqueOrThrow: mockTestRunFindUniqueOrThrow,
      update: mockTestRunUpdate,
    },
  };
  mockPrisma.$transaction = vi.fn((fn: any) => fn(mockPrisma));
  mockPrisma.$executeRawUnsafe = vi.fn();
  return { prisma: mockPrisma };
});

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

const { simulatorRouter } = await import('../server/routers/simulator');

const t = initTRPC.context<any>().create();
const createCaller = t.createCallerFactory(simulatorRouter);

function buildCtx() {
  return {
    session: {
      user: { id: 'user-1', email: 'pi@evia.dev', name: 'PI', role: 'PI', environments: ['sandbox'] },
    },
    user: { id: 'user-1', email: 'pi@evia.dev', name: 'PI', role: 'PI', environments: ['sandbox'] },
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUserUpsert.mockResolvedValue({ id: 'db-user-1', firebase_uid: 'test-user-pipeline-1' });
  mockSessionLogCreate.mockResolvedValue({ id: 'session-1' });
  mockTestRunCreate.mockResolvedValue({ id: 'run-1' });
});

describe('simulatorRouter.sendMessage — fault passthrough', () => {
  it('passes testMode.faults through to processTurn when a fault is provided', async () => {
    mockTestRunFindUniqueOrThrow.mockResolvedValue({ id: 'run-1', results: { turns: [] }, status: 'pass' });
    mockProcessTurn.mockResolvedValue({ type: 'agent_turn', message: 'A degraded reply.', signals: [] });

    const caller = createCaller(buildCtx());
    await caller.sendMessage({
      runId: 'run-1',
      uid: 'test-user-pipeline-1',
      sessionId: 'session-1',
      environment: 'sandbox',
      message: 'Hello',
      fault: { boundary: 'A1', type: 'api_error' },
    });

    expect(mockProcessTurn).toHaveBeenCalledTimes(1);
    const [, , , , opts] = mockProcessTurn.mock.calls[0];
    expect(opts.testMode.faults).toEqual({ boundary: 'A1', type: 'api_error' });
    expect(opts.testMode.captureSignalBus).toBe(true);
  });

  it('omits testMode.faults entirely when no fault is provided', async () => {
    mockTestRunFindUniqueOrThrow.mockResolvedValue({ id: 'run-1', results: { turns: [] }, status: 'pass' });
    mockProcessTurn.mockResolvedValue({ type: 'agent_turn', message: 'A normal reply.', signals: [] });

    const caller = createCaller(buildCtx());
    await caller.sendMessage({
      runId: 'run-1',
      uid: 'test-user-pipeline-1',
      sessionId: 'session-1',
      environment: 'sandbox',
      message: 'Hello',
    });

    const [, , , , opts] = mockProcessTurn.mock.calls[0];
    expect(opts.testMode.faults).toBeUndefined();
  });
});
