import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initTRPC } from '@trpc/server';

// ─── Real, unmocked test of the production A8 router ───────────────────────
// enumerateA8Cells() imports the real apps/api/src/agents/a8-router.ts
// routeTurn directly — no mocking here, this is a genuine regression test
// against the live production decision table.
import { enumerateA8Cells } from '../lib/a8-state-space';

describe('enumerateA8Cells (real routeTurn, no mocks)', () => {
  it('returns exactly 15 rows (5 safety states x 3 governance states)', () => {
    const cells = enumerateA8Cells();
    expect(cells).toHaveLength(15);
  });

  it('every cell passes against the verified expected decision table', () => {
    const cells = enumerateA8Cells();
    const failures = cells.filter((c) => !c.pass);
    expect(failures).toEqual([]);
    expect(cells.every((c) => c.pass)).toBe(true);
  });

  it('covers all 5 safety states x 3 governance states exactly once each', () => {
    const cells = enumerateA8Cells();
    const keys = cells.map((c) => `${c.safety_state}:${c.governance_state}`);
    expect(new Set(keys).size).toBe(15);
  });

  it('S4 always routes to crisis regardless of governance state', () => {
    const cells = enumerateA8Cells().filter((c) => c.safety_state === 'S4');
    expect(cells).toHaveLength(3);
    expect(cells.every((c) => c.actual.agent === 'crisis')).toBe(true);
  });

  it('Blocked governance routes to A2 mode=blocked, except at S4 where crisis takes precedence', () => {
    const cells = enumerateA8Cells().filter((c) => c.governance_state === 'Blocked');
    expect(cells).toHaveLength(5);
    const nonS4 = cells.filter((c) => c.safety_state !== 'S4');
    expect(nonS4).toHaveLength(4);
    expect(nonS4.every((c) => c.actual.agent === 'A2' && c.actual.mode === 'blocked')).toBe(true);
    const s4 = cells.find((c) => c.safety_state === 'S4');
    expect(s4?.actual.agent).toBe('crisis');
  });
});

// ─── Mocked agent-adapter tests for runNtimes / runAcrossRestarts ──────────
// These need Prisma/session setup we can't do without a live DB here, so we
// mock invokeAgent directly (per the TH-S13 spec) rather than going through
// the real agent-adapter -> apps/api chain.

const mockInvokeAgent = vi.hoisted(() => vi.fn());

vi.mock('../lib/agent-adapter', () => ({
  invokeAgent: mockInvokeAgent,
}));

const mockClearRetrievedContext = vi.hoisted(() => vi.fn());
const mockClearToolResult = vi.hoisted(() => vi.fn());

vi.mock('../../../api/src/lib/retrieved-context-cache.js', () => ({
  clearRetrievedContext: mockClearRetrievedContext,
  getRetrievedContext: vi.fn(),
  setRetrievedContext: vi.fn(),
}));

vi.mock('../../../api/src/lib/tool-result-store.js', () => ({
  clearToolResult: mockClearToolResult,
  getToolResult: vi.fn(),
  setToolResult: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

const { determinismRouter, hashOutput } = await import('../server/routers/determinism');

describe('hashOutput', () => {
  it('hashes structurally-identical objects the same regardless of key insertion order', () => {
    const a = { safetyState: 'S1', signal: { crisis: false, intensity: 3 } };
    const b = { signal: { intensity: 3, crisis: false }, safetyState: 'S1' };

    expect(hashOutput(a)).toBe(hashOutput(b));
  });

  it('still hashes genuinely different content differently', () => {
    const a = { safetyState: 'S1' };
    const b = { safetyState: 'S2' };

    expect(hashOutput(a)).not.toBe(hashOutput(b));
  });

  it('hashes key-order-permuted array elements consistently', () => {
    const a = [{ x: 1, y: 2 }, { y: 4, x: 3 }];
    const b = [{ y: 2, x: 1 }, { x: 3, y: 4 }];

    expect(hashOutput(a)).toBe(hashOutput(b));
  });
});

const t = initTRPC.context<any>().create();
const createCaller = t.createCallerFactory(determinismRouter);

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
  } as any;
}

describe('determinismRouter.enumerateA8StateSpace', () => {
  it('returns 15 rows via the tRPC procedure', async () => {
    const caller = createCaller(buildCtx());
    const cells = await caller.enumerateA8StateSpace();
    expect(cells).toHaveLength(15);
    expect(cells.every((c) => c.pass)).toBe(true);
  });
});

describe('determinismRouter.runNtimes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs the agent n times, hashes outputs, and counts exact matches when deterministic', async () => {
    mockInvokeAgent.mockResolvedValue({
      output: { agent: 'A2', mode: 'normal' },
      latencyMs: 5,
      mockMode: true,
    });
    const caller = createCaller(buildCtx());

    const result = await caller.runNtimes({ agentId: 'A8', input: { safety_state: 'S0' }, n: 4 });

    expect(mockInvokeAgent).toHaveBeenCalledTimes(4);
    expect(result.runs).toHaveLength(4);
    expect(result.exactMatchCount).toBe(4);
    expect(result.runs.every((r) => typeof r.hash === 'string' && r.hash.length === 64)).toBe(true);
  });

  it('detects divergent outputs across runs', async () => {
    mockInvokeAgent
      .mockResolvedValueOnce({ output: { agent: 'A2', mode: 'normal' }, latencyMs: 1, mockMode: true })
      .mockResolvedValueOnce({ output: { agent: 'A2', mode: 'grounding-only' }, latencyMs: 1, mockMode: true })
      .mockResolvedValueOnce({ output: { agent: 'A2', mode: 'normal' }, latencyMs: 1, mockMode: true });
    const caller = createCaller(buildCtx());

    const result = await caller.runNtimes({ agentId: 'A2', input: {}, n: 3 });

    expect(result.exactMatchCount).toBe(2);
  });
});

describe('determinismRouter.runAcrossRestarts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs once, clears caches, runs again, and reports no change when deterministic', async () => {
    mockInvokeAgent.mockResolvedValue({
      output: { agent: 'A2', mode: 'normal' },
      latencyMs: 3,
      mockMode: true,
    });
    const caller = createCaller(buildCtx());

    const result = await caller.runAcrossRestarts({
      agentId: 'A8',
      input: { safety_state: 'S0' },
      sessionId: 'sess-1',
    });

    expect(mockInvokeAgent).toHaveBeenCalledTimes(2);
    expect(mockClearRetrievedContext).toHaveBeenCalledWith('sess-1');
    expect(mockClearToolResult).toHaveBeenCalledWith('sess-1');
    expect(result.changed).toBe(false);
    expect(result.before.output).toEqual(result.after.output);
  });

  it('reports changed=true when the post-restart output differs', async () => {
    mockInvokeAgent
      .mockResolvedValueOnce({ output: { a: 1 }, latencyMs: 1, mockMode: true })
      .mockResolvedValueOnce({ output: { a: 2 }, latencyMs: 1, mockMode: true });
    const caller = createCaller(buildCtx());

    const result = await caller.runAcrossRestarts({ agentId: 'A2', input: {} });

    expect(result.changed).toBe(true);
  });
});
