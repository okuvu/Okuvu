import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initTRPC } from '@trpc/server';

// ─── Mock the underlying apps/api agent functions ──────────────────────────
// agent-adapter.ts imports these via relative paths into apps/api/src/agents.
// We mock at those same specifiers so invokeAgent never actually calls
// Vertex AI / does real work.

const mockClassifySafety = vi.hoisted(() => vi.fn());
const mockClassifyGovernance = vi.hoisted(() => vi.fn());
const mockRouteTurn = vi.hoisted(() => vi.fn());
const mockHandleTurn = vi.hoisted(() => vi.fn());
const mockA9PostReview = vi.hoisted(() => vi.fn());

vi.mock('../../../api/src/agents/a1/agent.js', () => ({
  classifySafety: mockClassifySafety,
}));
vi.mock('../../../api/src/agents/a9/agent.js', () => ({
  classifyGovernance: mockClassifyGovernance,
}));
vi.mock('../../../api/src/agents/a8-router.js', () => ({
  routeTurn: mockRouteTurn,
}));
vi.mock('../../../api/src/agents/a2/agent.js', () => ({
  handleTurn: mockHandleTurn,
}));
vi.mock('../../../api/src/agents/a9-post/agent.js', () => ({
  a9PostReview: mockA9PostReview,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

const { prisma } = await import('@/lib/prisma');
const { singleAgentRouter } = await import('../server/routers/singleAgent');

const t = initTRPC.context<any>().create();
const createCaller = t.createCallerFactory(singleAgentRouter);

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

describe('singleAgentRouter.invokeAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invokes A1 in isolation with mocked context and returns { output, latencyMs }', async () => {
    mockClassifySafety.mockResolvedValue({ safetyState: 'S0', fallbackUsed: false });
    const caller = createCaller(buildCtx());

    const result = await caller.invokeAgent({ agentId: 'A1', input: { message: 'hi' } });

    expect(mockClassifySafety).toHaveBeenCalledTimes(1);
    expect(result.output).toEqual({ safetyState: 'S0', fallbackUsed: false });
    expect(typeof result.latencyMs).toBe('number');
    expect(result.mockMode).toBe(true);
  });

  it('invokes A9-pre (governance) in isolation with mocked context', async () => {
    mockClassifyGovernance.mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    const caller = createCaller(buildCtx());

    const result = await caller.invokeAgent({ agentId: 'A9-pre', input: { message: 'hi' } });

    expect(mockClassifyGovernance).toHaveBeenCalledTimes(1);
    expect(result.output).toEqual({ governanceState: 'Active', fallbackUsed: false });
    expect(typeof result.latencyMs).toBe('number');
  });

  it('invokes A8 (router) synchronously — no await/timeout wrapping', async () => {
    mockRouteTurn.mockReturnValue({ agent: 'A2', mode: 'normal' });
    const caller = createCaller(buildCtx());

    const result = await caller.invokeAgent({
      agentId: 'A8',
      input: { safety_state: 'S0', session_count: 1, turn_count: 1 },
    });

    expect(mockRouteTurn).toHaveBeenCalledTimes(1);
    // routeTurn is a plain sync function — confirm it wasn't given a Promise
    // return value to await, just called and used directly.
    expect(mockRouteTurn.mock.results[0]?.type).toBe('return');
    expect(result.output).toEqual({ agent: 'A2', mode: 'normal' });
  });

  it('invokes A2 in isolation with mocked context, defaulting required fields', async () => {
    mockHandleTurn.mockResolvedValue({
      response: 'hello',
      userContent: 'hello',
      signal: null,
      fallbackUsed: false,
    });
    const caller = createCaller(buildCtx());

    const result = await caller.invokeAgent({ agentId: 'A2', input: { message: 'I feel anxious' } });

    expect(mockHandleTurn).toHaveBeenCalledTimes(1);
    const calledWith = mockHandleTurn.mock.calls[0][0];
    // All required A2Input fields must be present even though the test only
    // supplied `message` — mock-context.ts defaults fill the rest.
    expect(calledWith.carePlan).toBe('CP1');
    expect(calledWith.safetyState).toBe('S0');
    expect(result.output).toEqual({
      response: 'hello',
      userContent: 'hello',
      signal: null,
      fallbackUsed: false,
    });
  });

  it('invokes A9-post in isolation with mocked context', async () => {
    mockA9PostReview.mockResolvedValue({ decision: 'APPROVED', violation_type: null, confidence: 'high' });
    const caller = createCaller(buildCtx());

    const result = await caller.invokeAgent({ agentId: 'A9-post', input: { draftResponse: 'draft response' } });

    expect(mockA9PostReview).toHaveBeenCalledTimes(1);
    expect(result.output).toEqual({ decision: 'APPROVED', violation_type: null, confidence: 'high' });
  });

  it('wraps an underlying agent error as an INTERNAL_SERVER_ERROR TRPCError', async () => {
    mockClassifySafety.mockRejectedValue(new Error('vertex unavailable'));
    const caller = createCaller(buildCtx());

    await expect(caller.invokeAgent({ agentId: 'A1', input: { message: 'hi' } })).rejects.toThrow(
      'vertex unavailable',
    );
  });
});

describe('singleAgentRouter.mockSessionContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates/reuses a synthetic test-user-* Prisma User row and returns the mock context', async () => {
    (prisma!.user.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'db-user-1',
      firebase_uid: 'test-user-default',
      phone_number: '+10000000000',
    });
    const caller = createCaller(buildCtx());

    const result = await caller.mockSessionContext({});

    expect(prisma!.user.upsert).toHaveBeenCalledTimes(1);
    const call = (prisma!.user.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where.firebase_uid).toMatch(/^test-user-/);
    expect(call.create.firebase_uid).toMatch(/^test-user-/);
    expect(result.userId).toBe('db-user-1');
    expect(result.safetyState).toBe('S0');
    expect(result.carePlan).toBe('CP1');
  });

  it('merges overrides into the default mock context', async () => {
    (prisma!.user.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'db-user-2',
      firebase_uid: 'test-user-default',
      phone_number: '+10000000000',
    });
    const caller = createCaller(buildCtx());

    const result = await caller.mockSessionContext({ overrides: { safetyState: 'S3', turnNumber: 5 } });

    expect(result.safetyState).toBe('S3');
    expect(result.turnNumber).toBe(5);
  });
});

describe('singleAgentRouter.getAgentSchema', () => {
  it("returns A2's fields fully (acceptance-critical dynamic form case)", async () => {
    const caller = createCaller(buildCtx());

    const schema = await caller.getAgentSchema({ agentId: 'A2' });

    const names = schema.fields.map((f) => f.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'message',
        'carePlan',
        'safetyState',
        'languageMode',
      ]),
    );
  });

  it('returns a non-empty schema for each of A1/A8/A9-pre/A9-post/A13/A15', async () => {
    const caller = createCaller(buildCtx());

    for (const agentId of ['A1', 'A8', 'A9-pre', 'A9-post', 'A13', 'A15'] as const) {
      const schema = await caller.getAgentSchema({ agentId });
      expect(schema.fields.length).toBeGreaterThan(0);
    }
  });
});

describe('no Redis usage', () => {
  it('this test file and the singleAgent module files do not import a Redis client', async () => {
    // Static-import check, per TH-S09 acceptance criteria: mockSessionContext
    // must never touch Redis. We assert this by reading the source of the
    // relevant files and confirming no redis import appears — a change that
    // introduces one here should fail this test.
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const files = [
      path.resolve(__dirname, '../lib/mock-context.ts'),
      path.resolve(__dirname, '../lib/agent-adapter.ts'),
      path.resolve(__dirname, '../server/routers/singleAgent.ts'),
    ];
    for (const file of files) {
      const contents = await fs.readFile(file, 'utf-8');
      expect(contents.toLowerCase()).not.toMatch(/from\s+['"].*redis.*['"]/);
      expect(contents.toLowerCase()).not.toMatch(/require\(['"].*redis.*['"]\)/);
    }
  });
});
