import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initTRPC } from '@trpc/server';

// `withEnvironment` (prisma-rls.ts) wraps every RLS-scoped table access in
// `prisma.$transaction(tx => ...)` + a `SET LOCAL` — the mock below routes
// both back to this same mocked `prisma` object so every existing
// per-table `vi.fn()` mock keeps working unchanged.
vi.mock('@/lib/prisma', () => {
  const mockPrisma: any = {
    gateSignOff: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    testRun: {
      update: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      groupBy: vi.fn(),
    },
    modelConfigPin: {
      findFirst: vi.fn(),
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
const { dashboardRouter } = await import('../server/routers/dashboard');

// A local `t` instance is sufficient to build a caller factory — it only
// needs to operate on the already-built router's procedures, and doesn't
// need to be the same `t` instance the router was defined with.
const t = initTRPC.context<any>().create();
const createCaller = t.createCallerFactory(dashboardRouter);

function buildCtx(overrides?: Partial<{ role: 'PI' | 'RATER' | 'ENGINEER' }>) {
  return {
    session: {
      user: {
        id: 'user-1',
        email: 'pi@evia.dev',
        name: 'PI User',
        role: overrides?.role ?? 'PI',
        environments: ['sandbox', 'staging', 'beta'],
      },
    },
    user: {
      id: 'user-1',
      email: 'pi@evia.dev',
      name: 'PI User',
      role: overrides?.role ?? 'PI',
      environments: ['sandbox', 'staging', 'beta'],
    },
    prisma,
  } as any;
}

describe('dashboardRouter.signOffGate — immutability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('only calls gateSignOff.create — never gateSignOff.update or testRun.update', async () => {
    vi.mocked(prisma!.gateSignOff.create).mockResolvedValue({
      id: 'gate-1',
      gate: 'safety-gate',
      run_id: null,
      environment: 'sandbox',
      signed_by: 'pi@evia.dev',
      decision: 'APPROVED',
      evidence: null,
      signed_at: new Date(),
    } as any);

    const caller = createCaller(buildCtx({ role: 'PI' }));

    await caller.signOffGate({
      gate: 'safety-gate',
      environment: 'sandbox',
      decision: 'APPROVED',
      evidence: 'Reviewed manually',
    });

    expect(prisma!.gateSignOff.create).toHaveBeenCalledTimes(1);
    expect(prisma!.gateSignOff.create).toHaveBeenCalledWith({
      data: {
        gate: 'safety-gate',
        environment: 'sandbox',
        run_id: undefined,
        decision: 'APPROVED',
        evidence: 'Reviewed manually',
        signed_by: 'pi@evia.dev',
      },
    });
    expect(prisma!.gateSignOff.update).not.toHaveBeenCalled();
    expect(prisma!.testRun.update).not.toHaveBeenCalled();
  });

  it('rejects non-PI roles with FORBIDDEN and never touches prisma', async () => {
    const caller = createCaller(buildCtx({ role: 'RATER' }));

    await expect(
      caller.signOffGate({
        gate: 'safety-gate',
        environment: 'sandbox',
        decision: 'APPROVED',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(prisma!.gateSignOff.create).not.toHaveBeenCalled();
    expect(prisma!.gateSignOff.update).not.toHaveBeenCalled();
    expect(prisma!.testRun.update).not.toHaveBeenCalled();
  });
});
