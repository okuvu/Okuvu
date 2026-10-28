import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * E17-S4 — the safety core fails closed.
 *
 * Three claims, each of which was false on the base commit:
 *
 *  1. When the classifier (A1) is unreachable, an explicit crisis disclosure
 *     still reaches the crisis path. Before this story the failure produced
 *     `safetyState: 'S2'`, so the turn went to A2 and the user got supportive
 *     chat (E17-S1 §7, E17-S2 §465).
 *  2. When the classifier is unreachable and there is no crisis language, the
 *     user gets a governed static substitute — never the model client's generic
 *     "I'm here to support you. Could you tell me more about how you're
 *     feeling?", which reads like a normal reply.
 *  3. When the *reply* model is unreachable, the throttle is nameable: a
 *     distinct fallback source and a `safety` code on the result, still a warm
 *     governed line, never an error.
 *
 * Everything below the model is the production code: the real A1, the real
 * router, the real fallbacks, the real `processTurn`, and the real audit chain
 * append (`lib/audit-log.ts`) against an in-memory delegate that enforces the
 * migration's UNIQUE constraints. Only `generateContent` (the model call) and
 * the database are stubbed — there is no Postgres and no model in this
 * environment.
 */

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
}));

vi.mock('../lib/generate-content.js', () => ({
  generateContent: mocks.generateContent,
  DEFAULT_MAX_OUTPUT_TOKENS: 2048,
  DEFAULT_TIMEOUT_MS: 30_000,
}));

// The orchestrator reads its context bundle from the DB in production; stubbed
// here so the suite is about the safety path rather than about seeding rows.
vi.mock('../lib/agent-context.js', () => ({
  getAgentContextBundle: vi.fn(),
  summariesToConversationTurns: vi.fn(() => []),
}));

vi.mock('../lib/memory-retrieval.js', () => ({
  retrieveRelevantSessions: vi.fn(async () => []),
  formatRetrievedContext: vi.fn(() => 'null'),
}));

vi.mock('../lib/prisma.js', async () => {
  const { makeAuditEventDelegate } = await import('./helpers/in-memory-audit-event.js');
  const auditEvent = makeAuditEventDelegate();

  const prisma = {
    sessionLog: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
    turn: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    safetyState: { upsert: vi.fn(), findUnique: vi.fn() },
    clinicalConfig: { update: vi.fn(), upsert: vi.fn() },
    governanceLog: { create: vi.fn() },
    user: { findUnique: vi.fn() },
    auditEvent,
    $transaction: vi.fn(() => Promise.resolve([{ id: 'user-turn-1' }, { id: 'assistant-turn-1' }])),
  };

  return { prisma };
});

import { processTurn } from '../pipeline/orchestrator.js';
import { prisma } from '../lib/prisma.js';
import { verifyPersistedAuditChain, readPersistedAuditChain } from '../lib/audit-log.js';
import { AUDIT_GENESIS } from '../lib/audit-chain.js';
import {
  CRISIS_RESPONSE,
  SAFETY_UNAVAILABLE_RESPONSE,
  MODEL_UNAVAILABLE_RESPONSE,
  A9_POST_S2_FALLBACK,
  A9_POST_DEGRADED_RESPONSE,
} from '../pipeline/fallbacks.js';
import { SAFE_FALLBACK } from '../lib/canned-response.js';
import { buildApp } from '../app.js';
import { getAgentContextBundle } from '../lib/agent-context.js';

const UID = 'subject-e17s4';
const SESSION_ID = 'session-e17s4';

const auditDelegate = (
  prisma as unknown as {
    auditEvent: { reset: () => void; rows: Array<Record<string, unknown>> };
  }
).auditEvent;

/** The stored rows, as objects a test can corrupt in place. */
function auditRows(): Array<Record<string, unknown>> {
  return auditDelegate.rows;
}

/** A model call that answered normally, with the JSON each agent expects. */
type ModelReply =
  | { kind: 'ok'; text: string }
  | { kind: 'failed'; failureKind: 'timeout' | 'throttled' | 'unavailable' };

const OK_A9_PRE = JSON.stringify({ governanceState: 'Active', reasonCode: null, confidence: 'medium', notes: null });
const OK_A9_POST = JSON.stringify({ decision: 'APPROVED', violation_type: null, confidence: 'high', notes: null });

function a1Json(state: string, crisis = false): string {
  return JSON.stringify({
    safetyState: state,
    crisis_language_detected: crisis,
    basis: 'literal',
    signal_strength: crisis ? 'high' : 'medium',
    notes: null,
  });
}

/**
 * Route each agent's model call to its own reply. The dispatch is on the
 * request shape the agents actually send, not on call order: A1 is the only
 * caller with a `safetyState` response schema, A9-post the only one with the
 * 20s timeout, A9-pre the only one with a 200-token JSON budget, and A2 sends
 * no generation config at all.
 */
function model(options: {
  a1?: ModelReply;
  a2?: ModelReply;
  a9pre?: ModelReply;
  a9post?: ModelReply;
}): void {
  mocks.generateContent.mockImplementation(async (params: {
    generationConfig?: { responseSchema?: { properties?: Record<string, unknown> }; maxOutputTokens?: number };
    timeoutMs?: number;
  }) => {
    const schema = params.generationConfig?.responseSchema?.properties;
    const which = schema?.safetyState
      ? options.a1 ?? { kind: 'ok', text: a1Json('S1') }
      : params.timeoutMs === 20_000
        ? options.a9post ?? { kind: 'ok', text: OK_A9_POST }
        : params.generationConfig?.maxOutputTokens === 200
          ? options.a9pre ?? { kind: 'ok', text: OK_A9_PRE }
          : options.a2 ?? { kind: 'ok', text: 'That sounds heavy. What has today been like?' };

    if (which.kind === 'failed') {
      // Exactly what apps/api/src/lib/bedrock.ts returns when the model is
      // unreachable: the SAFE_FALLBACK sentinel, never fabricated text.
      return {
        text: SAFE_FALLBACK,
        fallbackUsed: true,
        failureReason: which.failureKind === 'timeout' ? 'timeout' : 'api_error',
        failureKind: which.failureKind,
        model: 'qwen.qwen3-32b-v1:0',
        canned: false,
      };
    }

    return { text: which.text, fallbackUsed: false, model: 'qwen.qwen3-32b-v1:0', canned: false };
  });
}

/** Both classifiers unreachable — the shape a Bedrock throttle produces. */
function everythingThrottled(): void {
  model({
    a1: { kind: 'failed', failureKind: 'throttled' },
    a2: { kind: 'failed', failureKind: 'throttled' },
    a9pre: { kind: 'failed', failureKind: 'throttled' },
    a9post: { kind: 'failed', failureKind: 'throttled' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  auditDelegate.reset();

  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
  // `session_ended_at: null` is what makes the session open — `isSessionClosed`
  // reads the field directly, and an absent one reads as closed.
  vi.mocked(prisma.sessionLog.findUnique).mockResolvedValue({ session_ended_at: null, turn_count: 0 } as never);
  vi.mocked(prisma.sessionLog.update).mockResolvedValue({ turn_count: 1 } as never);
  vi.mocked(prisma.sessionLog.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.turn.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.safetyState.upsert).mockResolvedValue({} as never);
  vi.mocked(prisma.governanceLog.create).mockResolvedValue({} as never);
  vi.mocked(prisma.turn.create).mockResolvedValue({ id: 'assistant-turn-1' } as never);

  // A2's and A9-post's prompts are long; the orchestrator reads its context
  // bundle from the DB in production, so this one seam is stubbed to keep the
  // suite about the safety path rather than about seeding rows.
  vi.mocked(getAgentContextBundle).mockResolvedValue({
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
  } as never);
});

// `getAgentContextBundle` is real in production; stub it at module level too so
// the import above resolves to the stub in every test in this file.
vi.mock('../lib/agent-context.js', () => ({
  getAgentContextBundle: vi.fn(),
  summariesToConversationTurns: vi.fn(() => []),
}));

vi.mock('../lib/memory-retrieval.js', () => ({
  retrieveRelevantSessions: vi.fn(async () => []),
  formatRetrievedContext: vi.fn(() => 'null'),
}));

// ─── 1. The crisis-detection set, with the classifier unreachable ───────────

const CRISIS_SET = [
  'I want to die',
  'I am going to kill myself tonight',
  'I keep thinking about suicide',
  'I want to end my life',
  'I just want to end it all',
];

const NON_CRISIS_SET = [
  'I feel low today and I could not get out of bed',
  'work has been stressful and I am exhausted',
  'my therapist cancelled again and I am annoyed',
];

describe('E17-S4 — crisis detection when the classifier is unreachable', () => {
  it.each(CRISIS_SET)('routes %j to the crisis path while every model call fails', async (message) => {
    everythingThrottled();

    const result = await processTurn(UID, SESSION_ID, message);

    expect(result.type).toBe('crisis');
    if (result.type === 'crisis') {
      expect(result.message).toBe(CRISIS_RESPONSE);
      // The helplines are the point: the user is never left with a shrug.
      expect(result.message).toContain('iCall');
      expect(result.message).toContain('Vandrevala');
      expect(result.safety).toEqual({ code: 'CRISIS_FLOOR', reason: 'llm_throttled', crisis_floor: true });
    }
  });

  it('persists the crisis turn, the S4 safety state and the crisis flag on the floor path', async () => {
    everythingThrottled();

    await processTurn(UID, SESSION_ID, 'I want to die');

    // Audit 1.3's three records — the crisis path must be reviewable even when
    // no model was involved in detecting it.
    const turnWrites = vi.mocked(prisma.turn.create).mock.calls.map((c) => c[0].data as Record<string, unknown>);
    expect(turnWrites).toEqual([
      expect.objectContaining({ role: 'user', content: 'I want to die' }),
      expect.objectContaining({ role: 'assistant', content: CRISIS_RESPONSE }),
    ]);
    expect(prisma.safetyState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { safety_state_current: 'S4' } }),
    );
    expect(prisma.sessionLog.update).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      data: { crisis_flag_detected: true },
    });
  });

  it.each(NON_CRISIS_SET)('never forces %j onto the crisis path', async (message) => {
    everythingThrottled();

    const result = await processTurn(UID, SESSION_ID, message);

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.message).not.toBe(CRISIS_RESPONSE);
      expect(result.safety?.code).toBe('SAFETY_UNAVAILABLE');
    }
  });
});

// ─── 2. No crisis language + no classifier ⇒ governed substitute ────────────

describe('E17-S4 — an unassessable turn is served as a governed fallback', () => {
  it('serves SAFETY_UNAVAILABLE_RESPONSE and never calls the reply model', async () => {
    everythingThrottled();

    const result = await processTurn(UID, SESSION_ID, 'I feel low today');

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.message).toBe(SAFETY_UNAVAILABLE_RESPONSE);
      expect(result.message).not.toBe(SAFE_FALLBACK);
      expect(result.message).toContain('9152987821');
      expect(result.fallbackUsed).toBe(true);
      expect(result.fallbackSource).toBe('safety_unavailable');
      expect(result.safety).toEqual({ code: 'SAFETY_UNAVAILABLE', reason: 'llm_throttled' });
    }

    // The reply model was never asked: an ungated reply at an unknown safety
    // state is the fail-open outcome this path exists to prevent.
    const a2Calls = mocks.generateContent.mock.calls.filter(
      ([params]) => (params as { generationConfig?: unknown }).generationConfig === undefined,
    );
    expect(a2Calls).toEqual([]);
  });

  it('marks the persisted turn with the substitute’s own source', async () => {
    everythingThrottled();

    await processTurn(UID, SESSION_ID, 'I feel low today');

    // The assistant Turn row built by `$transaction` (whose delegate is mocked)
    // must attribute the substitute, so the scorecard's zero-tolerance fallback
    // count sees it.
    const assistantWrite = vi.mocked(prisma.turn.create).mock.calls.at(-1)?.[0].data as Record<string, unknown>;
    expect(assistantWrite).toEqual(
      expect.objectContaining({ content: SAFETY_UNAVAILABLE_RESPONSE, fallback_source: 'safety_unavailable' }),
    );
  });

  it('a parse failure in the classifier is treated the same as an outage', async () => {
    model({ a1: { kind: 'ok', text: 'not json at all' }, a9pre: { kind: 'ok', text: OK_A9_PRE } });

    const result = await processTurn(UID, SESSION_ID, 'I feel low today');

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.message).toBe(SAFETY_UNAVAILABLE_RESPONSE);
      expect(result.safety).toEqual({ code: 'SAFETY_UNAVAILABLE', reason: 'parse_failure' });
    }
  });
});

// ─── 3. The reply model is unreachable after a real classification ──────────

describe('E17-S4 — a classified turn whose reply model fails', () => {
  it('serves MODEL_UNAVAILABLE_RESPONSE for a non-elevated turn, not SAFE_FALLBACK', async () => {
    model({
      a1: { kind: 'ok', text: a1Json('S1') },
      a9pre: { kind: 'ok', text: OK_A9_PRE },
      a2: { kind: 'failed', failureKind: 'throttled' },
    });

    const result = await processTurn(UID, SESSION_ID, 'work has been stressful');

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.message).toBe(MODEL_UNAVAILABLE_RESPONSE);
      expect(result.message).not.toBe(SAFE_FALLBACK);
      expect(result.fallbackSource).toBe('model_throttled');
      expect(result.safety).toEqual({ code: 'MODEL_THROTTLED', reason: 'llm_throttled' });
      expect(result.failureReason).toBe('api_error');
    }
  });

  it('keeps the steadier S2 failover copy at elevated risk', async () => {
    model({
      a1: { kind: 'ok', text: a1Json('S2') },
      a9pre: { kind: 'ok', text: OK_A9_PRE },
      a2: { kind: 'failed', failureKind: 'unavailable' },
    });

    const result = await processTurn(UID, SESSION_ID, 'work has been stressful');

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.message).toBe(A9_POST_S2_FALLBACK);
      expect(result.fallbackSource).toBe('model_unavailable');
      expect(result.safety).toEqual({ code: 'MODEL_UNAVAILABLE', reason: 'llm_api_error' });
    }
  });

  it('distinguishes a timeout from a throttle and from an outage', async () => {
    model({
      a1: { kind: 'ok', text: a1Json('S0') },
      a9pre: { kind: 'ok', text: OK_A9_PRE },
      a2: { kind: 'failed', failureKind: 'timeout' },
    });

    const timedOut = await processTurn(UID, SESSION_ID, 'work has been stressful');

    expect(timedOut.type).toBe('agent_turn');
    if (timedOut.type === 'agent_turn') {
      expect(timedOut.failureReason).toBe('timeout');
      expect(timedOut.fallbackSource).toBe('model_unavailable');
      expect(timedOut.safety).toEqual({ code: 'MODEL_UNAVAILABLE', reason: 'llm_timeout' });
    }
  });

  it('never serves A9-post’s generic getSafeFallback() string for a clean S0 turn', async () => {
    model({
      a1: { kind: 'ok', text: a1Json('S0') },
      a9pre: { kind: 'ok', text: OK_A9_PRE },
      a2: { kind: 'failed', failureKind: 'unavailable' },
    });

    const result = await processTurn(UID, SESSION_ID, 'work has been stressful');

    if (result.type === 'agent_turn') {
      expect(result.message).not.toBe(A9_POST_DEGRADED_RESPONSE);
      expect(result.message).toBe(MODEL_UNAVAILABLE_RESPONSE);
    }
  });
});

// ─── 4. The audit chain records all of it and verifies ─────────────────────

describe('E17-S4 — the audit chain verifies after a run', () => {
  it('appends a verifying row for a crisis turn and for a degraded turn', async () => {
    everythingThrottled();

    await processTurn(UID, SESSION_ID, 'I want to die');
    await processTurn(UID, SESSION_ID, 'I feel low today');

    const chain = await readPersistedAuditChain();
    expect(chain.map((e) => e.action)).toEqual(['SAFETY_CRISIS_ROUTED', 'SAFETY_UNAVAILABLE_FALLBACK']);
    expect(chain[0].prev_hash).toBe(AUDIT_GENESIS);
    expect(chain[1].prev_hash).toBe(chain[0].hash);
    expect(chain[0].detail).toEqual(
      expect.objectContaining({ safety_state: 'S4', crisis_floor: true, classifier_fallback: true }),
    );

    const verification = await verifyPersistedAuditChain();
    expect(verification).toEqual({ ok: true, count: 2, firstBadSeq: null, head: chain[1].hash });
  });

  it('fails verification when a stored row is edited', async () => {
    everythingThrottled();
    await processTurn(UID, SESSION_ID, 'I want to die');

    // Edit the sealed body of the first row, exactly what tampering looks like.
    const rows = auditRows() as Array<{ body: string }>;
    rows[0].body = rows[0].body.replace('"S4"', '"S0"');

    const verification = await verifyPersistedAuditChain();
    expect(verification.ok).toBe(false);
    expect(verification.firstBadSeq).toBe(1);
  });

  it('fails verification when a queryable column disagrees with the sealed body', async () => {
    everythingThrottled();
    await processTurn(UID, SESSION_ID, 'I want to die');

    const rows = auditRows() as Array<{ action: string }>;
    rows[0].action = 'TURN_COMPLETED';

    const verification = await verifyPersistedAuditChain();
    expect(verification.ok).toBe(false);
    expect(verification.firstBadSeq).toBe(1);
  });

  it('detects a gap in the sequence', async () => {
    everythingThrottled();
    await processTurn(UID, SESSION_ID, 'I want to die');
    await processTurn(UID, SESSION_ID, 'I feel low today');

    const rows = auditRows();
    rows.splice(0, 1); // drop the first row, leaving seq to start at 2

    const verification = await verifyPersistedAuditChain();
    expect(verification.ok).toBe(false);
    expect(verification.firstBadSeq).toBe(2);
  });
});

// ─── 5. The endpoint the acceptance criterion names ─────────────────────────

describe('E17-S4 — GET /audit/verify', () => {
  const ORIGINAL_ENV = { ...process.env };
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns ok:true with a count greater than zero after a run', async () => {
    everythingThrottled();
    await processTurn(UID, SESSION_ID, 'I want to die');
    await processTurn(UID, SESSION_ID, 'I feel low today');

    const response = await app.inject({ method: 'GET', url: '/audit/verify' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { ok: boolean; count: number; first_bad_seq: number | null };
    expect(body.ok).toBe(true);
    expect(body.count).toBeGreaterThan(0);
    expect(body.count).toBe(2);
    expect(body.first_bad_seq).toBeNull();
  });

  it('returns 500 with ok:false when the chain has been tampered with', async () => {
    everythingThrottled();
    await processTurn(UID, SESSION_ID, 'I want to die');

    const rows = auditRows() as Array<{ body: string }>;
    rows[0].body = rows[0].body.replace('"S4"', '"S0"');

    const response = await app.inject({ method: 'GET', url: '/audit/verify' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual(expect.objectContaining({ ok: false, first_bad_seq: 1 }));
  });

  it('verifies an empty chain as ok:true, count:0 — "nothing recorded" is not "altered"', async () => {
    const response = await app.inject({ method: 'GET', url: '/audit/verify' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, count: 0, first_bad_seq: null, head: AUDIT_GENESIS });
  });
});
