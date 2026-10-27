import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initTRPC } from '@trpc/server';

const mockInvokeAgent = vi.hoisted(() => vi.fn());

vi.mock('../lib/agent-adapter', () => ({
  invokeAgent: mockInvokeAgent,
}));

// `withEnvironment` (prisma-rls.ts) wraps every RLS-scoped table access in
// `prisma.$transaction(tx => ...)` + a `SET LOCAL` — the mock below routes
// both back to this same mocked `prisma` object so every existing
// per-table `vi.fn()` mock keeps working unchanged.
vi.mock('@/lib/prisma', () => {
  const mockPrisma: any = {
    testBudget: {
      findUnique: vi.fn(),
    },
    testRun: {
      create: vi.fn(),
    },
  };
  mockPrisma.$transaction = vi.fn((fn: any) => fn(mockPrisma));
  mockPrisma.$executeRawUnsafe = vi.fn();
  return { prisma: mockPrisma };
});

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

const { prisma } = await import('@/lib/prisma');
const { stochasticRouter } = await import('../server/routers/stochastic');

const t = initTRPC.context<any>().create();
const createCaller = t.createCallerFactory(stochasticRouter);

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

describe('stochasticRouter.checkBudget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks when spent_inr + estimate would exceed monthly_cap_inr', async () => {
    (prisma!.testBudget.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'budget-1',
      environment: 'sandbox',
      monthly_cap_inr: 100,
      spent_inr: 95,
      reset_month: '2026-08',
    });
    const caller = createCaller(buildCtx());

    const result = await caller.checkBudget({ environment: 'sandbox', estimatedCostInr: 10 });

    expect(result.allowed).toBe(false);
    expect(result.capInr).toBe(100);
    expect(result.spentInr).toBe(95);
    expect(result.wouldExceedBy).toBeCloseTo(5, 6);
  });

  it('allows when no TestBudget row exists for the environment (unlimited/no cap)', async () => {
    (prisma!.testBudget.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const caller = createCaller(buildCtx());

    const result = await caller.checkBudget({ environment: 'staging', estimatedCostInr: 500 });

    expect(result.allowed).toBe(true);
    expect(result.capInr).toBeNull();
  });

  it('allows when spend stays within cap', async () => {
    (prisma!.testBudget.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'budget-2',
      environment: 'beta',
      monthly_cap_inr: 1000,
      spent_inr: 100,
      reset_month: '2026-08',
    });
    const caller = createCaller(buildCtx());

    const result = await caller.checkBudget({ environment: 'beta', estimatedCostInr: 50 });

    expect(result.allowed).toBe(true);
    expect(result.wouldExceedBy).toBeUndefined();
  });
});

describe('stochasticRouter.estimateCost', () => {
  it('returns a positive INR cost scaling with n', async () => {
    const caller = createCaller(buildCtx());

    const small = await caller.estimateCost({ model: 'amazon.nova-pro-v1:0', n: 200 });
    const large = await caller.estimateCost({ model: 'amazon.nova-pro-v1:0', n: 400 });

    expect(small.estimatedCostInr).toBeGreaterThan(0);
    expect(large.estimatedCostInr).toBeCloseTo(small.estimatedCostInr * 2, 6);
  });
});

describe('stochasticRouter.computeWilsonCI', () => {
  it('delegates to the wilson.ts formula', async () => {
    const caller = createCaller(buildCtx());
    const result = await caller.computeWilsonCI({ successes: 190, n: 200 });
    expect(result.lower).toBeCloseTo(0.9104209437021562, 6);
    expect(result.upper).toBeCloseTo(0.9726176509713551, 6);
  });
});

describe('stochasticRouter.runSampling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects n < 200 with a zod validation error', async () => {
    const caller = createCaller(buildCtx());

    await expect(
      caller.runSampling({
        agentId: 'A1',
        input: {},
        n: 199,
        targetMetric: 'safetyState',
        threshold: 0.9,
        environment: 'sandbox',
      }),
    ).rejects.toThrow();

    expect(mockInvokeAgent).not.toHaveBeenCalled();
  });

  it('refuses to run when checkBudget disallows (PRECONDITION_FAILED), never invoking the agent', async () => {
    (prisma!.testBudget.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'budget-3',
      environment: 'sandbox',
      monthly_cap_inr: 0.0001,
      spent_inr: 0,
      reset_month: '2026-08',
    });
    const caller = createCaller(buildCtx());

    await expect(
      caller.runSampling({
        agentId: 'A1',
        input: {},
        n: 200,
        targetMetric: 'safetyState',
        threshold: 0.9,
        environment: 'sandbox',
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

    expect(mockInvokeAgent).not.toHaveBeenCalled();
    expect(prisma!.testRun.create).not.toHaveBeenCalled();
  });

  it('runs n samples, computes the Wilson CI, gates on the threshold, and persists a TestRun', async () => {
    (prisma!.testBudget.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    mockInvokeAgent.mockResolvedValue({
      output: { safetyState: 'S0' },
      latencyMs: 5,
      mockMode: true,
    });
    (prisma!.testRun.create as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: any) => ({ id: 'run-1', ...data }),
    );
    const caller = createCaller(buildCtx());

    const result = await caller.runSampling({
      agentId: 'A1',
      input: { message: 'hi' },
      n: 200,
      targetMetric: 'safetyState',
      threshold: 0.5,
      environment: 'sandbox',
    });

    expect(mockInvokeAgent).toHaveBeenCalledTimes(200);
    // Each call gets a distinct synthetic userId for independence.
    const userIds = mockInvokeAgent.mock.calls.map((call) => call[2]?.userId);
    expect(new Set(userIds).size).toBe(200);
    userIds.forEach((id) => expect(id).toMatch(/^test-user-/));

    expect(result.n).toBe(200);
    expect(result.successCount).toBe(200);
    expect(result.wilsonCI.lower).toBeGreaterThan(0.5);
    expect(result.gatePassed).toBe(true);
    expect(result.runId).toBe('run-1');

    expect(prisma!.testRun.create).toHaveBeenCalledTimes(1);
    const createArgs = (prisma!.testRun.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createArgs.data.status).toBe('pass');
    expect(createArgs.data.environment).toBe('sandbox');
  });

  it('gates to halt when the Wilson lower bound falls below threshold', async () => {
    (prisma!.testBudget.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    // All samples fail the target metric (falsy field).
    mockInvokeAgent.mockResolvedValue({
      output: { safetyState: null },
      latencyMs: 5,
      mockMode: true,
    });
    (prisma!.testRun.create as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: any) => ({ id: 'run-2', ...data }),
    );
    const caller = createCaller(buildCtx());

    const result = await caller.runSampling({
      agentId: 'A1',
      input: {},
      n: 200,
      targetMetric: 'safetyState',
      threshold: 0.5,
      environment: 'sandbox',
    });

    expect(result.successCount).toBe(0);
    expect(result.gatePassed).toBe(false);
    const createArgs = (prisma!.testRun.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createArgs.data.status).toBe('halt');
  });
});
