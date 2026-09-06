import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initTRPC } from '@trpc/server';

const mockTestRunFindMany = vi.hoisted(() => vi.fn());
const mockBaselineArchiveCreate = vi.hoisted(() => vi.fn());
const mockBaselineArchiveFindFirst = vi.hoisted(() => vi.fn());

const mockWithEnvironment = vi.hoisted(() =>
  vi.fn(async (_env: string, fn: (tx: unknown) => unknown) =>
    fn({
      testRun: { findMany: mockTestRunFindMany },
      baselineArchive: { create: mockBaselineArchiveCreate, findFirst: mockBaselineArchiveFindFirst },
    }),
  ),
);
vi.mock('@/lib/prisma-rls', () => ({
  withEnvironment: mockWithEnvironment,
}));

const { scorecardRouter } = await import('../server/routers/scorecard');

const t = initTRPC.context<any>().create();
const createCaller = t.createCallerFactory(scorecardRouter);

function buildCtx(role: 'PI' | 'ENGINEER' | 'RATER' = 'PI') {
  return {
    session: { user: { id: 'user-1', email: 'pi@evia.dev', name: 'PI User', role, environments: ['staging'] } },
    user: { id: 'user-1', email: 'pi@evia.dev', name: 'PI User', role, environments: ['staging'] },
    prisma: null,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('scorecardRouter.getScorecard', () => {
  it('computes a scorecard from the most recent runs for an environment when runIds is omitted', async () => {
    mockTestRunFindMany.mockResolvedValue([
      { id: 'r1', status: 'pass', canned: false, results: {} },
      { id: 'r2', status: 'halt', canned: true, results: { result: { type: 'agent_turn', fallbackUsed: true } } },
    ]);

    const caller = createCaller(buildCtx());
    const result = await caller.getScorecard({ environment: 'staging' });

    expect(result.totalRuns).toBe(2);
    expect(result.statusCounts).toEqual({ pass: 1, halt: 1 });
    expect(result.fallbackCount).toBe(1);
    expect(mockTestRunFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { environment: 'staging' }, take: 500 }),
    );
  });

  it('scopes to an explicit runIds set when provided', async () => {
    mockTestRunFindMany.mockResolvedValue([{ id: 'r1', status: 'pass', canned: false, results: {} }]);

    const caller = createCaller(buildCtx());
    await caller.getScorecard({ environment: 'staging', runIds: ['r1'] });

    expect(mockTestRunFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['r1'] } } }),
    );
  });
});

describe('scorecardRouter.pinBaseline', () => {
  it('rejects non-PI roles', async () => {
    const caller = createCaller(buildCtx('ENGINEER'));

    await expect(
      caller.pinBaseline({ environment: 'staging', label: 'gemini-pre-cutover', runIds: ['r1'] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('creates a BaselineArchive row for a PI', async () => {
    mockBaselineArchiveCreate.mockResolvedValue({
      id: 'baseline-1',
      environment: 'staging',
      label: 'gemini-pre-cutover',
      run_ids: ['r1', 'r2'],
      pinned_by: 'pi@evia.dev',
      pinned_at: new Date(),
    });

    const caller = createCaller(buildCtx('PI'));
    const result = await caller.pinBaseline({
      environment: 'staging',
      label: 'gemini-pre-cutover',
      runIds: ['r1', 'r2'],
    });

    expect(mockBaselineArchiveCreate).toHaveBeenCalledWith({
      data: {
        environment: 'staging',
        label: 'gemini-pre-cutover',
        run_ids: ['r1', 'r2'],
        pinned_by: 'pi@evia.dev',
      },
    });
    expect(result.id).toBe('baseline-1');
  });
});

describe('scorecardRouter.getLatestBaseline', () => {
  it('returns null when no baseline has been pinned yet', async () => {
    mockBaselineArchiveFindFirst.mockResolvedValue(null);
    const caller = createCaller(buildCtx());

    const result = await caller.getLatestBaseline({ environment: 'staging', label: 'gemini-pre-cutover' });

    expect(result).toBeNull();
  });
});

describe('scorecardRouter.compareToBaseline', () => {
  it('throws PRECONDITION_FAILED when no baseline is pinned', async () => {
    mockBaselineArchiveFindFirst.mockResolvedValue(null);
    const caller = createCaller(buildCtx());

    await expect(
      caller.compareToBaseline({ environment: 'staging', label: 'gemini-pre-cutover' }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('diffs the current run set against the pinned baseline run set', async () => {
    mockBaselineArchiveFindFirst.mockResolvedValue({
      id: 'baseline-1',
      label: 'gemini-pre-cutover',
      run_ids: ['b1'],
      pinned_at: new Date('2026-01-01'),
    });
    mockTestRunFindMany
      .mockResolvedValueOnce([
        { id: 'c1', status: 'pass', canned: false, results: {} },
        { id: 'c2', status: 'pass', canned: false, results: {} },
      ])
      .mockResolvedValueOnce([{ id: 'b1', status: 'pass', canned: false, results: {} }]);

    const caller = createCaller(buildCtx());
    const result = await caller.compareToBaseline({ environment: 'staging', label: 'gemini-pre-cutover' });

    expect(result.baseline.runCount).toBe(1);
    expect(result.current.passRate).toBe(1);
    expect(result.baselineStats.passRate).toBe(1);
    expect(result.delta.passRateDelta).toBe(0);
  });
});
