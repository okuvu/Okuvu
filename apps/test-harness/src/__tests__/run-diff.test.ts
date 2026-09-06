import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initTRPC } from '@trpc/server';
import { diffRuns } from '../lib/run-diff';

describe('diffRuns', () => {
  it('returns empty diffs when the two runs are identical', () => {
    const a = {
      frozen_triple: {
        modelVersion: 'gemini-2.5-flash',
        promptHash: 'abc123',
        temperature: 0.7,
        safetySettings: 'default',
        suiteVersion: 'v1',
        inputId: 'case-1',
        timestamp: '2026-01-01T00:00:00.000Z',
        rawOutput: 'hello',
      },
      results: { trace: [{ stage: 'A1', elapsedMs: 10 }], signals: [{ boundary: 'A1_result' }] },
    };
    const b = JSON.parse(JSON.stringify(a));

    const diff = diffRuns(a, b);

    expect(diff.frozenTripleDiff).toEqual({});
    expect(diff.outputDiff).toEqual([]);
  });

  it('identifies differing frozen_triple fields', () => {
    const a = {
      frozen_triple: {
        modelVersion: 'gemini-2.5-flash',
        promptHash: 'abc123',
        temperature: 0.7,
        safetySettings: 'default',
        suiteVersion: 'v1',
        inputId: 'case-1',
        timestamp: '2026-01-01T00:00:00.000Z',
        rawOutput: 'hello',
      },
      results: {},
    };
    const b = {
      frozen_triple: {
        ...a.frozen_triple,
        modelVersion: 'gemini-2.5-pro',
        temperature: 0.9,
      },
      results: {},
    };

    const diff = diffRuns(a, b);

    expect(diff.frozenTripleDiff).toEqual({
      modelVersion: { a: 'gemini-2.5-flash', b: 'gemini-2.5-pro' },
      temperature: { a: 0.7, b: 0.9 },
    });
    // Unchanged fields must not appear.
    expect(diff.frozenTripleDiff.promptHash).toBeUndefined();
    expect(diff.frozenTripleDiff.suiteVersion).toBeUndefined();
  });

  it('gracefully handles a missing frozen_triple field on one side', () => {
    const a = { frozen_triple: { modelVersion: 'gemini-2.5-flash' }, results: {} };
    const b = { frozen_triple: {}, results: {} };

    const diff = diffRuns(a, b);

    expect(diff.frozenTripleDiff.modelVersion).toEqual({ a: 'gemini-2.5-flash', b: undefined });
  });

  it('produces an itemized structural diff of results, including nested paths', () => {
    const a = {
      frozen_triple: {},
      results: {
        result: { message: 'hi', turnCount: 1 },
        trace: [{ stage: 'A1', elapsedMs: 10 }],
        signals: [{ boundary: 'A1_result', payload: 'S0' }],
      },
    };
    const b = {
      frozen_triple: {},
      results: {
        result: { message: 'hello', turnCount: 1 },
        trace: [{ stage: 'A1', elapsedMs: 12 }],
        signals: [{ boundary: 'A1_result', payload: 'S0' }],
      },
    };

    const diff = diffRuns(a, b);

    expect(diff.outputDiff).toEqual(
      expect.arrayContaining([
        { path: 'result.message', a: 'hi', b: 'hello' },
        { path: 'trace', a: a.results.trace, b: b.results.trace },
      ]),
    );
    // signals were identical — no entry for that path.
    expect(diff.outputDiff.find((e) => e.path === 'signals')).toBeUndefined();
  });

  it('reports a key present only on one side of results', () => {
    const a = { frozen_triple: {}, results: { onlyInA: 'x' } };
    const b = { frozen_triple: {}, results: {} };

    const diff = diffRuns(a, b);

    expect(diff.outputDiff).toEqual([{ path: 'onlyInA', a: 'x', b: undefined }]);
  });
});

// ─── archiveRun immutability guarantee ──────────────────────────────────
// Core acceptance criterion: no procedure in results.ts may mutate an
// existing TestRun beyond the sanctioned `archived_at` flag. This asserts
// archiveRun calls prisma.testRun.update with ONLY `{ archived_at }` in
// `data` — never any other field.

const mockTestRunUpdate = vi.hoisted(() => vi.fn());
const mockTestRunFindUnique = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

// `withAnyEnvironment`/`withEnvironment` (prisma-rls.ts) wrap every
// RLS-scoped table access in `prisma.$transaction(tx => ...)` + a `SET
// LOCAL` — the mock below routes both back to this same mocked `prisma`
// object so every existing per-table `vi.fn()` mock keeps working
// unchanged. `archiveRun` now reads the row first (to discover its
// environment) before updating it, so `findUnique` needs a mock too.
vi.mock('@/lib/prisma', () => {
  const mockPrisma: any = {
    testRun: { update: mockTestRunUpdate, findUnique: mockTestRunFindUnique },
  };
  mockPrisma.$transaction = vi.fn((fn: any) => fn(mockPrisma));
  mockPrisma.$executeRawUnsafe = vi.fn();
  return { prisma: mockPrisma };
});

const { prisma } = await import('@/lib/prisma');
const { resultsRouter } = await import('../server/routers/results');

const t = initTRPC.context<any>().create();
const createCaller = t.createCallerFactory(resultsRouter);

function buildCtx() {
  return {
    session: {
      user: { id: 'user-1', email: 'engineer@evia.dev', name: 'Engineer', role: 'ENGINEER', environments: ['sandbox'] },
    },
    user: { id: 'user-1', email: 'engineer@evia.dev', name: 'Engineer', role: 'ENGINEER', environments: ['sandbox'] },
    prisma,
  } as any;
}

describe('resultsRouter.archiveRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls prisma.testRun.update with ONLY archived_at, never any other field', async () => {
    mockTestRunFindUnique.mockResolvedValue({ id: 'run-1', environment: 'sandbox' });
    mockTestRunUpdate.mockResolvedValue({ id: 'run-1', archived_at: new Date() });
    const caller = createCaller(buildCtx());

    await caller.archiveRun({ runId: 'run-1' });

    expect(mockTestRunUpdate).toHaveBeenCalledTimes(1);
    const callArgs = mockTestRunUpdate.mock.calls[0][0];

    expect(callArgs.where).toEqual({ id: 'run-1' });
    expect(Object.keys(callArgs.data)).toEqual(['archived_at']);
    expect(callArgs.data.archived_at).toBeInstanceOf(Date);
  });
});
