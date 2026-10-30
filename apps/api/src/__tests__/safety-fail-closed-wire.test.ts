import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http2 from 'node:http2';
import type { AddressInfo } from 'node:net';

/**
 * E17-S4 — what the *user actually receives* when Bedrock is unreachable.
 *
 * This is the wire-level half of `safety-fail-closed.test.ts`. Everything is
 * production code: `buildApp()`, the `@fastify/websocket` route, the budget
 * gate, `processTurn`, the real A1/A2/A9/A9-post agents, the real
 * `@aws-sdk/client-bedrock-runtime` client, and the real `bedrock.ts` failure
 * mapping. The only things stubbed are the database (there is no Postgres here)
 * and Bedrock itself — which is stubbed as an h2c server, the transport this SDK
 * version negotiates against an `http://` endpoint (E17-S1 §1).
 *
 * The stub answers exactly the way the service answers when a quota bites: HTTP
 * 429 with `x-amzn-ErrorType: ThrottlingException`. Before this story that
 * produced `SAFE_FALLBACK` — "I'm here to support you. Could you tell me more
 * about how you're feeling?" — for every message, including an explicit
 * disclosure (E17-S2 §465). The assertions below are the ones that would have
 * failed on the base commit.
 */

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  safetyStateFindUnique: vi.fn(),
  sessionLogCreate: vi.fn(),
  sessionLogFindFirst: vi.fn(),
  sessionLogFindUnique: vi.fn(),
  sessionLogUpdate: vi.fn(),
  sessionLogCount: vi.fn(),
  turnCreate: vi.fn(),
  turnFindFirst: vi.fn(),
  turnFindMany: vi.fn(),
  safetyStateUpsert: vi.fn(),
  clinicalConfigUpsert: vi.fn(),
  clinicalConfigUpdate: vi.fn(),
  governanceLogCreate: vi.fn(),
  getAgentContextBundle: vi.fn(),
  // Filled in by the prisma mock factory below so each test can start with an
  // empty chain; an audit row from the previous test would otherwise leak into
  // the next test's count.
  auditDelegate: null as unknown as { reset: () => void },
}));

vi.mock('../lib/redis.js', () => ({ getRedisClient: () => null }));

vi.mock('../lib/agent-context.js', () => ({
  getAgentContextBundle: mocks.getAgentContextBundle,
  summariesToConversationTurns: () => [],
}));

vi.mock('../lib/memory-retrieval.js', () => ({
  retrieveRelevantSessions: async () => [],
  formatRetrievedContext: () => 'null',
}));

vi.mock('../lib/prisma.js', async () => {
  const { makeAuditEventDelegate } = await import('./helpers/in-memory-audit-event.js');
  mocks.auditDelegate = makeAuditEventDelegate();

  return {
    prisma: {
      user: { findUnique: mocks.userFindUnique },
      safetyState: { findUnique: mocks.safetyStateFindUnique, upsert: mocks.safetyStateUpsert },
      sessionLog: {
        create: mocks.sessionLogCreate,
        findFirst: mocks.sessionLogFindFirst,
        findUnique: mocks.sessionLogFindUnique,
        update: mocks.sessionLogUpdate,
        count: mocks.sessionLogCount,
      },
      turn: { create: mocks.turnCreate, findFirst: mocks.turnFindFirst, findMany: mocks.turnFindMany },
      clinicalConfig: { upsert: mocks.clinicalConfigUpsert, update: mocks.clinicalConfigUpdate },
      governanceLog: { create: mocks.governanceLogCreate },
      auditEvent: mocks.auditDelegate,
      $transaction: vi.fn(async (ops: unknown) => ops),
    },
  };
});

import { buildApp } from '../app.js';
import { clearBedrockClient } from '../lib/bedrock.js';
import { CRISIS_RESPONSE, SAFETY_UNAVAILABLE_RESPONSE } from '../pipeline/fallbacks.js';
import { SAFE_FALLBACK } from '../lib/canned-response.js';

interface ServerFrame {
  type: string;
  payload: Record<string, unknown>;
}

interface Stub {
  url: string;
  paths: string[];
  close: () => Promise<void>;
}

/**
 * A Bedrock-runtime stand-in. `respond` gets the request path and body so a
 * test can answer A1 and A2 differently — the same way a real throttled account
 * would fail both, and the way a working one would answer both.
 */
async function startConverseStub(
  respond: (req: { path: string; body: string }) => { status: number; headers?: Record<string, string>; body: string },
): Promise<Stub> {
  const paths: string[] = [];
  const server = http2.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const path = String(req.headers[':path']);
      paths.push(`${req.method} ${path}`);
      const reply = respond({ path, body });
      res.writeHead(reply.status, { 'content-type': 'application/json', ...reply.headers });
      res.end(reply.body);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    paths,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function structured(input: Record<string, unknown>): string {
  return JSON.stringify({
    output: {
      message: {
        role: 'assistant',
        content: [{ toolUse: { toolUseId: 'tool-1', name: 'emit_structured_json', input } }],
      },
    },
    stopReason: 'tool_use',
  });
}

const throttled = () => ({
  status: 429,
  headers: { 'x-amzn-ErrorType': 'ThrottlingException' },
  body: JSON.stringify({ message: 'Too many requests, please wait before trying again.' }),
});

interface Socket {
  readyState: number;
  send: (data: string) => void;
  close: () => void;
  addEventListener: (event: string, handler: (event: { data: unknown }) => void) => void;
}

const WebSocketClient = (globalThis as unknown as { WebSocket?: new (url: string) => Socket }).WebSocket;

const WS_OPEN = 1;

function waitFor(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
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

const ENV_KEYS = [
  'LLM_PROVIDER',
  'BEDROCK_MODEL_ID',
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
  'AWS_ENDPOINT_URL',
  'AWS_PROFILE',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'USE_CANNED_LLM_RESPONSE',
  'LOCAL_DEV_BYPASS_AUTH',
] as const;

const ORIGINAL_ENV = { ...process.env };

describe('E17-S4: an unreachable model fails closed over a real WebSocket', () => {
  let app: ReturnType<typeof buildApp>;
  let stub: Stub | undefined;
  let socket: Socket | null = null;
  let frames: ServerFrame[] = [];

  beforeEach(async () => {
    const base: Record<string, string | undefined> = { ...ORIGINAL_ENV };
    for (const key of ENV_KEYS) delete base[key];
    base.LLM_PROVIDER = 'bedrock';
    base.BEDROCK_MODEL_ID = 'qwen.qwen3-32b-v1:0';
    base.LOCAL_DEV_BYPASS_AUTH = 'true';
    process.env = base as NodeJS.ProcessEnv;

    frames = [];
    mocks.auditDelegate?.reset();
    mocks.userFindUnique.mockResolvedValue({ id: 'user-1' });
    mocks.safetyStateFindUnique.mockResolvedValue(null);
    mocks.safetyStateUpsert.mockResolvedValue({});
    mocks.sessionLogFindFirst.mockResolvedValue(null);
    mocks.sessionLogFindUnique.mockResolvedValue({ session_ended_at: null, turn_count: 0 });
    mocks.sessionLogUpdate.mockResolvedValue({ turn_count: 1 });
    mocks.sessionLogCount.mockResolvedValue(0);
    mocks.sessionLogCreate.mockResolvedValue({
      id: 'session-wire-1',
      session_started_at: new Date('2026-10-28T12:00:00.000Z'),
    });
    mocks.turnFindFirst.mockResolvedValue(null);
    mocks.turnFindMany.mockResolvedValue([]);
    mocks.turnCreate.mockResolvedValue({ id: 'assistant-turn-1' });
    mocks.clinicalConfigUpsert.mockResolvedValue({});
    mocks.clinicalConfigUpdate.mockResolvedValue({});
    mocks.governanceLogCreate.mockResolvedValue({});
    mocks.getAgentContextBundle.mockResolvedValue({
      safety_state: null,
      care_plan: { id: 'cp-1', care_plan_id: 'CP1', assignment_state: 'provisional' },
      recent_history: [],
      session_summary: null,
      engagement: { current_streak: 0, longest_streak: 0, voice_mode_enabled: false, consent_1: true, consent_2: false, consent_3: false, consent_4: false },
      user_memory: null,
      language_mode: 'english',
      therapist_name: null,
      care_plan_focus: 'anxiety and worry',
      homework: null,
    });

    clearBedrockClient();
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
    if (stub) await stub.close();
    stub = undefined;
    clearBedrockClient();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  async function pointAt(next: Stub): Promise<void> {
    stub = next;
    process.env.AWS_ENDPOINT_URL = next.url;
    process.env.AWS_REGION = 'ap-south-1';
    process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
    delete process.env.AWS_PROFILE;
    clearBedrockClient();
  }

  /** Connects and opens a session through the real handler. */
  async function openSession(): Promise<void> {
    const { port } = app.server.address() as AddressInfo;
    if (!WebSocketClient) throw new Error('this Node runtime exposes no global WebSocket client');
    socket = new WebSocketClient(`ws://127.0.0.1:${port}/ws`);
    socket.addEventListener('message', (event: { data: unknown }) => {
      frames.push(JSON.parse(String(event.data)) as ServerFrame);
    });
    await waitFor(() => socket?.readyState === WS_OPEN);

    socket.send(JSON.stringify({ type: 'SESSION_OPEN', payload: {} }));
    await waitFor(() => frames.some((f) => f.type === 'SESSION_OPEN_CONFIRMED'));
  }

  /** Sends one USER_TURN on the open connection and waits for its reply frame. */
  async function sendTurn(message: string): Promise<void> {
    const before = frames.length;
    const sessionId = String(frames.find((f) => f.type === 'SESSION_OPEN_CONFIRMED')?.payload.session_id);
    socket!.send(JSON.stringify({ type: 'USER_TURN', payload: { session_id: sessionId, message } }));
    await waitFor(() =>
      frames
        .slice(before)
        .some((f) => f.type === 'AGENT_TURN' || f.type === 'CRISIS_SIGNAL' || f.type === 'ERROR'),
    );
  }

  async function openAndSend(message: string): Promise<void> {
    await openSession();
    await sendTurn(message);
  }

  it('sends CRISIS_SIGNAL with the helplines when the model is throttled and the message is a disclosure', async () => {
    await pointAt(await startConverseStub(throttled));

    await openAndSend('I want to die');

    const crisis = frames.filter((f) => f.type === 'CRISIS_SIGNAL');
    expect(crisis).toHaveLength(1);
    expect(crisis[0].payload.message).toBe(CRISIS_RESPONSE);
    expect(String(crisis[0].payload.message)).toContain('iCall: 9152987821');

    const safety = crisis[0].payload.safety as Record<string, unknown>;
    expect(safety).toEqual({ code: 'CRISIS_FLOOR', reason: 'llm_throttled', crisis_floor: true });

    // Never an error frame, and never the generic supportive sentence.
    expect(frames.filter((f) => f.type === 'ERROR')).toHaveLength(0);
    expect(crisis[0].payload.message).not.toBe(SAFE_FALLBACK);

    // The classifier really was attempted over Converse, and really did fail.
    expect(stub?.paths).toContain('POST /model/qwen.qwen3-32b-v1%3A0/converse');
  });

  it('sends AGENT_TURN with the governed safety-unavailable line for a non-crisis message', async () => {
    await pointAt(await startConverseStub(throttled));

    await openAndSend('work has been stressful and I am exhausted');

    const turns = frames.filter((f) => f.type === 'AGENT_TURN');
    expect(turns).toHaveLength(1);
    expect(turns[0].payload.message).toBe(SAFETY_UNAVAILABLE_RESPONSE);
    expect(turns[0].payload.message).not.toBe(SAFE_FALLBACK);
    expect(String(turns[0].payload.message)).toContain('9152987821');
    expect(turns[0].payload.safety).toEqual({ code: 'SAFETY_UNAVAILABLE', reason: 'llm_throttled' });

    // A refusal/degrade that the client renders — never an ERROR frame, which
    // the deployed client drops silently.
    expect(frames.filter((f) => f.type === 'ERROR')).toHaveLength(0);
  });

  it('still takes the crisis path from a real model classification when the model answers', async () => {
    await pointAt(
      await startConverseStub(({ body }) =>
        // A1's forced-tool schema is the only request carrying `safetyState`.
        body.includes('safetyState')
          ? {
              status: 200,
              body: structured({
                safetyState: 'S4',
                crisis_language_detected: true,
                basis: 'literal',
                signal_strength: 'high',
                notes: null,
              }),
            }
          : {
              status: 200,
              body: structured({ governanceState: 'Active', reasonCode: null, confidence: 'medium', notes: null }),
            },
      ),
    );

    // E17-S10: the message matters here. "I want to die" now matches the
    // per-turn keyword floor as well, so the notice would say the floor raised
    // it — true, but not the fact this test is about. A plan with no explicit
    // phrase reaches S4 from the model alone.
    await openAndSend('I have a plan. Saturday, when everyone is out.');

    const crisis = frames.filter((f) => f.type === 'CRISIS_SIGNAL');
    expect(crisis).toHaveLength(1);
    expect(crisis[0].payload.message).toBe(CRISIS_RESPONSE);
    // Classified, not floored: no safety notice, because nothing degraded.
    expect(crisis[0].payload.safety).toBeUndefined();
    expect(frames.filter((f) => f.type === 'ERROR')).toHaveLength(0);
  });

  it('serves the crisis card when the keyword floor raises a confident S1 (E17-S10)', async () => {
    await pointAt(
      await startConverseStub(({ body }) =>
        body.includes('safetyState')
          ? {
              status: 200,
              body: structured({
                // A confident, wrong classification — the shape the gate
                // measured on csh-10.
                safetyState: 'S1',
                crisis_language_detected: false,
                basis: 'contextual',
                signal_strength: 'high',
                notes: null,
              }),
            }
          : {
              status: 200,
              body: structured({ governanceState: 'Active', reasonCode: null, confidence: 'medium', notes: null }),
            },
      ),
    );

    await openAndSend("the breathing isn't helping. I want to die.");

    const crisis = frames.filter((f) => f.type === 'CRISIS_SIGNAL');
    expect(crisis).toHaveLength(1);
    expect(crisis[0].payload.message).toBe(CRISIS_RESPONSE);
    // The floor, recorded honestly: the classifier answered, so the reason
    // names the keyword screen rather than an `llm_*` failure A1 never had.
    expect(crisis[0].payload.safety).toEqual({
      code: 'CRISIS_FLOOR',
      reason: 'crisis_keyword_floor',
      crisis_floor: true,
    });
    expect(frames.filter((f) => f.type === 'ERROR')).toHaveLength(0);
  });

  it('the audit chain verifies with a count greater than zero after these runs', async () => {
    await pointAt(await startConverseStub(throttled));

    await openSession();
    await sendTurn('I want to die');
    await sendTurn('work has been stressful and I am exhausted');

    const response = await app.inject({ method: 'GET', url: '/audit/verify' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { ok: boolean; count: number };
    expect(body.ok).toBe(true);
    expect(body.count).toBe(2);
  });
});
