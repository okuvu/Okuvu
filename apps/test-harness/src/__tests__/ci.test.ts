import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initTRPC } from '@trpc/server';

const mockListWorkflowRuns = vi.hoisted(() => vi.fn());
const mockTriggerWorkflowDispatch = vi.hoisted(() => vi.fn());

vi.mock('../lib/github-actions', async () => {
  const actual = await vi.importActual<typeof import('../lib/github-actions')>(
    '../lib/github-actions',
  );
  return {
    ...actual,
    listWorkflowRuns: mockListWorkflowRuns,
    triggerWorkflowDispatch: mockTriggerWorkflowDispatch,
  };
});

const { ciRouter } = await import('../server/routers/ci');
const { GitHubActionsConfigError } = await import('../lib/github-actions');

const t = initTRPC.context<any>().create();
const createCaller = t.createCallerFactory(ciRouter);

function buildCtx(role: 'PI' | 'ENGINEER' | 'RATER' = 'PI') {
  const user = {
    id: 'user-1',
    email: 'engineer@evia.dev',
    name: 'Engineer',
    role,
    environments: ['sandbox', 'staging', 'beta'],
  };
  return { session: { user }, user } as any;
}

function makeRun(overrides: Partial<{
  id: number;
  status: string;
  conclusion: string | null;
  created_at: string;
  html_url: string;
}> = {}) {
  return {
    id: 1,
    status: 'completed',
    conclusion: 'success',
    created_at: '2026-08-19T00:00:00.000Z',
    html_url: 'https://github.com/evia-org/evia/actions/runs/1',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ciRouter.getGateStatus', () => {
  it('maps GitHub conclusions onto TestRunStatus', async () => {
    mockListWorkflowRuns.mockResolvedValue([
      makeRun({ id: 1, status: 'completed', conclusion: 'success' }),
      makeRun({ id: 2, status: 'completed', conclusion: 'failure' }),
      makeRun({ id: 3, status: 'in_progress', conclusion: null }),
      makeRun({ id: 4, status: 'completed', conclusion: 'cancelled' }),
      makeRun({ id: 5, status: 'completed', conclusion: 'action_required' }),
    ]);

    const caller = createCaller(buildCtx());
    const result = await caller.getGateStatus();

    expect(mockListWorkflowRuns).toHaveBeenCalledWith('regression.yml');
    expect(result.map((r) => r.mappedStatus)).toEqual([
      'pass',
      'halt',
      'running',
      'error',
      'warning',
    ]);
  });

  it('throws PRECONDITION_FAILED when GITHUB_TOKEN/GITHUB_REPO are not configured', async () => {
    mockListWorkflowRuns.mockRejectedValue(
      new GitHubActionsConfigError('GITHUB_TOKEN/GITHUB_REPO not configured'),
    );

    const caller = createCaller(buildCtx());

    await expect(caller.getGateStatus()).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });

  it('surfaces unexpected errors as INTERNAL_SERVER_ERROR', async () => {
    mockListWorkflowRuns.mockRejectedValue(new Error('network blew up'));

    const caller = createCaller(buildCtx());

    await expect(caller.getGateStatus()).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
  });
});

describe('ciRouter.getHaltFailures', () => {
  it('filters to only HALT (failure) runs and keeps html_url for drill-down', async () => {
    mockListWorkflowRuns.mockResolvedValue([
      makeRun({ id: 1, conclusion: 'success' }),
      makeRun({ id: 2, conclusion: 'failure', html_url: 'https://github.com/x/actions/runs/2' }),
      makeRun({ id: 3, conclusion: 'failure', html_url: 'https://github.com/x/actions/runs/3' }),
    ]);

    const caller = createCaller(buildCtx());
    const result = await caller.getHaltFailures();

    expect(result).toHaveLength(2);
    expect(result.every((r) => r.mappedStatus === 'halt')).toBe(true);
    expect(result.map((r) => r.html_url)).toEqual([
      'https://github.com/x/actions/runs/2',
      'https://github.com/x/actions/runs/3',
    ]);
  });

  it('returns an empty array when there are no HALT runs', async () => {
    mockListWorkflowRuns.mockResolvedValue([makeRun({ id: 1, conclusion: 'success' })]);

    const caller = createCaller(buildCtx());
    const result = await caller.getHaltFailures();

    expect(result).toEqual([]);
  });
});

describe('ciRouter.triggerRegression', () => {
  it('calls triggerWorkflowDispatch for PI role', async () => {
    mockTriggerWorkflowDispatch.mockResolvedValue(undefined);

    const caller = createCaller(buildCtx('PI'));
    const result = await caller.triggerRegression();

    expect(mockTriggerWorkflowDispatch).toHaveBeenCalledWith('regression.yml');
    expect(result).toEqual({ triggered: true });
  });

  it('calls triggerWorkflowDispatch for ENGINEER role', async () => {
    mockTriggerWorkflowDispatch.mockResolvedValue(undefined);

    const caller = createCaller(buildCtx('ENGINEER'));
    await caller.triggerRegression();

    expect(mockTriggerWorkflowDispatch).toHaveBeenCalledWith('regression.yml');
  });

  it('rejects RATER role with FORBIDDEN', async () => {
    const caller = createCaller(buildCtx('RATER'));

    await expect(caller.triggerRegression()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mockTriggerWorkflowDispatch).not.toHaveBeenCalled();
  });

  it('surfaces config-missing errors as PRECONDITION_FAILED', async () => {
    mockTriggerWorkflowDispatch.mockRejectedValue(
      new GitHubActionsConfigError('GITHUB_TOKEN/GITHUB_REPO not configured'),
    );

    const caller = createCaller(buildCtx('PI'));

    await expect(caller.triggerRegression()).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });
});

// ─── Real (unmocked) config-missing behavior of github-actions.ts ─────────
// Exercises the actual getConfig() throw path — no mocking, GITHUB_TOKEN is
// simply unset — since this environment genuinely has no GitHub token
// configured and that's the path expected to be exercised in practice.

describe('github-actions.ts listWorkflowRuns (real, unmocked)', () => {
  it('throws GitHubActionsConfigError when GITHUB_TOKEN is unset', async () => {
    const previousToken = process.env.GITHUB_TOKEN;
    const previousRepo = process.env.GITHUB_REPO;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_REPO;

    try {
      const real = await vi.importActual<typeof import('../lib/github-actions')>(
        '../lib/github-actions',
      );
      await expect(real.listWorkflowRuns('regression.yml')).rejects.toThrow(
        /GITHUB_TOKEN\/GITHUB_REPO not configured/,
      );
    } finally {
      if (previousToken !== undefined) process.env.GITHUB_TOKEN = previousToken;
      if (previousRepo !== undefined) process.env.GITHUB_REPO = previousRepo;
    }
  });
});
