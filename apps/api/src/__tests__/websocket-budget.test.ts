import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AddressInfo } from 'node:net';

/**
 * E17-S6 — the budget is enforced on the real request path, over a real socket.
 *
 * Everything below the socket is the production code: `buildApp()`, the
 * `@fastify/websocket` route, `handleSessionOpen`, the budget gate
 * (`lib/token-budget.ts`) and the frame the client actually receives. Only the
 * database and the pipeline are stubbed (there is no Postgres in this test
 * environment and a real turn would call a real model), so what these tests
 * prove is that a `USER_TURN` off the wire is refused *before* `processTurn`,
 * and that what reaches the user is the governed message — never a generic
 * error and never silence.
 */

vi.mock('../lib/redis.js', () => ({
  getRedisClient: () => null,
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    safetyState: { findUnique: vi.fn() },
    sessionLog: { create: vi.fn(), findFirst: vi.fn() },
    turn: { findFirst: vi.fn() },
  },
}));

vi.mock('../pipeline/orchestrator.js', () => ({
  processTurn: vi.fn(),
}));

import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { processTurn } from '../pipeline/orchestrator.js';
import { BUDGET_PAUSED_RESPONSE } from '../pipeline/fallbacks.js';
import { __resetBudgetCounterStore, addBudgetUsage } from '../lib/token-budget.js';

const USER_ID = 'user-budget-1';
const SESSION_ID = 'session-budget-1';
const BYPASS_UID = 'dev-bypass-subject-1';

const SESSION_TOKEN_BUDGET = 1_000;
const DAILY_COST_BUDGET_USD = '0.5';

interface ServerFrame {
  type: string;
  payload: Record<string, unknown>;
}

/**
 * Node's own WebSocket client (built into the runtime), not the `ws` package:
 * `ws` is a transitive dependency of @fastify/websocket, and importing it
 * directly from @okuvu/api would be a phantom dependency — the kind pnpm's
 * isolated node_modules is supposed to make impossible.
 */
const WebSocketClient = (globalThis as unknown as {
  WebSocket: new (url: string) => {
    readyState: number;
    send: (data: string) => void;
    close: () => void;
    removeAllListeners?: () => void;
    addEventListener: (event: string, handler: (event: { data: unknown }) => void) => void;
  };
}).WebSocket;

const WS_OPEN = 1;

function instantiate(url: string): InstanceType<typeof WebSocketClient> {
  if (!WebSocketClient) throw new Error('this Node runtime exposes no global WebSocket client');
  return new WebSocketClient(url);
}

function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      if (predicate()) return resolve();
      if (Date.now() > deadline) return reject(new Error('timed out waiting for frame'));
      setTimeout(tick, 10);
    };
    tick();
  });
}

describe('E17-S6: USER_TURN budget enforcement over the WebSocket request path', () => {
  const originalEnv = { ...process.env };
  let app: ReturnType<typeof buildApp>;
  let socket: ReturnType<typeof instantiate> | null = null;
  let frames: ServerFrame[] = [];

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      LOCAL_DEV_BYPASS_AUTH: 'true',
      SESSION_TOKEN_BUDGET: String(SESSION_TOKEN_BUDGET),
      DAILY_COST_BUDGET_USD,
    };
    delete process.env.REDIS_URL;
    __resetBudgetCounterStore();
    frames = [];

    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: USER_ID } as never);
    vi.mocked(prisma.safetyState.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.sessionLog.create).mockResolvedValue({
      id: SESSION_ID,
      session_started_at: new Date('2026-10-28T12:00:00.000Z'),
    } as never);
    vi.mocked(processTurn).mockReset();
    vi.mocked(processTurn).mockResolvedValue({
      type: 'agent_turn',
      message: 'I am here with you.',
      turnCount: 1,
      turnId: 'turn-1',
      timing: [],
      fallbackUsed: false,
    } as never);

    app = buildApp();
    await app.ready();
    await app.listen({ port: 0, host: '127.0.0.1' });
  });

  afterEach(async () => {
    if (socket) {
      socket.close();
      socket = null;
    }
    if (app) await app.close();
    process.env = { ...originalEnv };
    __resetBudgetCounterStore();
    vi.clearAllMocks();
  });

  /** Connects, opens a session through the real handler, then sends one USER_TURN. */
  async function connectAndSend(message: string): Promise<void> {
    const { port } = app.server.address() as AddressInfo;
    socket = instantiate(`ws://127.0.0.1:${port}/ws`);
    socket.addEventListener('message', (event) => {
      frames.push(JSON.parse(String(event.data)) as ServerFrame);
    });
    await waitFor(() => socket?.readyState === WS_OPEN);

    socket.send(JSON.stringify({ type: 'SESSION_OPEN', payload: {} }));
    await waitFor(() => frames.some((f) => f.type === 'SESSION_OPEN_CONFIRMED'));

    socket.send(JSON.stringify({ type: 'USER_TURN', payload: { session_id: SESSION_ID, message } }));
    await waitFor(() =>
      frames.some((f) => f.type === 'AGENT_TURN' || f.type === 'ERROR' || f.type === 'CRISIS_SIGNAL'),
    );
  }

  function lastAgentTurn(): ServerFrame {
    const turns = frames.filter((f) => f.type === 'AGENT_TURN');
    expect(turns.length).toBeGreaterThan(0);
    return turns[turns.length - 1];
  }

  it('serves the turn normally while the session is under budget', async () => {
    await connectAndSend('hello there');

    expect(processTurn).toHaveBeenCalledTimes(1);
    expect(processTurn).toHaveBeenCalledWith(BYPASS_UID, SESSION_ID, 'hello there', null);

    const turn = lastAgentTurn();
    expect(turn.payload.message).toBe('I am here with you.');
    // No budget notice on a turn that was not refused.
    expect(turn.payload.budget).toBeUndefined();
  });

  it('refuses at the session boundary before any model call, with the governed message', async () => {
    // The session has already spent its whole budget on earlier turns.
    await addBudgetUsage({
      userId: BYPASS_UID,
      sessionId: SESSION_ID,
      usage: { inputTokens: SESSION_TOKEN_BUDGET, outputTokens: 0 },
    });

    await connectAndSend('hello again');

    // The request path stopped before the pipeline: no model call, no spend.
    expect(processTurn).not.toHaveBeenCalled();

    const turn = lastAgentTurn();
    expect(turn.payload.message).toBe(BUDGET_PAUSED_RESPONSE);
    // Not a generic error, and not the empty-body silence an ERROR frame gives
    // the deployed client.
    expect(turn.payload.message).not.toMatch(/error|failed|wrong/i);

    const notice = turn.payload.budget as Record<string, unknown>;
    expect(notice.code).toBe('BUDGET_EXCEEDED_SESSION');
    expect(notice.status).toBe(429);
    expect(notice.limits).toEqual({ session_tokens: SESSION_TOKEN_BUDGET, daily_cost_usd: 0.5 });
    expect((notice.used as Record<string, number>).session_tokens).toBe(SESSION_TOKEN_BUDGET);
    expect(notice.retry_after_seconds).toBeGreaterThan(0);

    // And no ERROR frame was emitted — a refusal is not a failure.
    expect(frames.filter((f) => f.type === 'ERROR')).toHaveLength(0);
  });

  it('refuses a turn when the day budget is exhausted, with its own code', async () => {
    // $0.50 at 0.18 µ$/input-token ⇒ 2,777,778 tokens of earlier spend today.
    // Keyed by the authenticated subject (`uid`), which is what the route uses —
    // the same identity the per-user rate limiter counts against.
    await addBudgetUsage({
      userId: BYPASS_UID,
      sessionId: null,
      usage: { inputTokens: 2_777_778, outputTokens: 0 },
    });

    await connectAndSend('hello again');

    expect(processTurn).not.toHaveBeenCalled();
    const notice = lastAgentTurn().payload.budget as Record<string, unknown>;
    expect(notice.code).toBe('BUDGET_EXCEEDED_DAY');
    expect(notice.status).toBe(429);
    expect((notice.used as Record<string, number>).daily_cost_usd).toBeCloseTo(0.5, 6);
  });

  it('admits an over-budget message that carries crisis language — the safety path is never blocked', async () => {
    await addBudgetUsage({
      userId: USER_ID,
      sessionId: SESSION_ID,
      usage: { inputTokens: SESSION_TOKEN_BUDGET, outputTokens: 0 },
    });

    await connectAndSend('I want to die');

    // The turn runs, and the pipeline — which classifies safety before
    // anything else — is what decides what the user sees.
    expect(processTurn).toHaveBeenCalledTimes(1);
    expect(lastAgentTurn().payload.budget).toBeUndefined();
  });
});
