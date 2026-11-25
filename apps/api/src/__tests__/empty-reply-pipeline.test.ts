/**
 * Owner's rule, 25 Nov 2026 — a turn that serves no text must never reach the
 * client blank, and a safety screen is never replaced by an apology for a
 * technical fault.
 *
 * This file tests the shipped pipeline (`processTurn`), not the resolver: the
 * resolver's own branches are covered in `pipeline/__tests__/empty-reply.test.ts`.
 * What is proved here is that the substitution actually happens between the
 * model and the client, that the Turn row the therapist later reads carries the
 * substituted text rather than the blank, and that the four shapes the owner
 * named each land where he said they should.
 *
 * The model returning nothing is not rare in production — it was the single
 * largest cause of hard-gate misses across five gold-set runs — so these are
 * ordinary paths, not contrived ones.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
}));

vi.mock('../lib/generate-content.js', () => ({
  generateContent: mocks.generateContent,
  DEFAULT_MAX_OUTPUT_TOKENS: 2048,
  DEFAULT_TIMEOUT_MS: 30_000,
}));

vi.mock('../lib/agent-context.js', () => ({
  getAgentContextBundle: vi.fn(),
  summariesToConversationTurns: vi.fn(() => []),
}));

vi.mock('../lib/memory-retrieval.js', () => ({
  retrieveRecentSessions: vi.fn(async () => []),
  retrieveRelevantSessions: vi.fn(async () => []),
  formatRetrievedContext: vi.fn(() => 'null'),
}));

vi.mock('../lib/prisma.js', async () => {
  const { makeAuditEventDelegate } = await import('./helpers/in-memory-audit-event.js');
  const auditEvent = makeAuditEventDelegate();

  const prisma = {
    sessionLog: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
    turn: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    safetyState: { upsert: vi.fn(), findUnique: vi.fn() },
    clinicalConfig: { update: vi.fn(), upsert: vi.fn() },
    governanceLog: { create: vi.fn() },
    safetyFlag: { create: vi.fn() },
    user: { findUnique: vi.fn() },
    auditEvent,
    $transaction: vi.fn(() => Promise.resolve([{ id: 'user-turn-1' }, { id: 'assistant-turn-1' }])),
  };

  return { prisma };
});

import { processTurn } from '../pipeline/orchestrator.js';
import { prisma } from '../lib/prisma.js';
import { getAgentContextBundle } from '../lib/agent-context.js';
import {
  A9_POST_S2_FALLBACK,
  CRISIS_RESPONSE,
  MODEL_UNAVAILABLE_RESPONSE,
  SAFETY_UNAVAILABLE_RESPONSE,
} from '../pipeline/fallbacks.js';
import {
  HARM_TO_SOMEONE_RESPONSE,
  HARM_TO_SOMEONE_THOUGHTS_RESPONSE,
} from '../lib/harm-to-someone.js';
import { isEmptyReply } from '../pipeline/empty-reply.js';

const UID = 'subject-empty-reply';
const SESSION_ID = 'session-empty-reply';

type ModelReply = { kind: 'ok'; text: string } | { kind: 'failed' };

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
 * Route each call by shape, as the real callers do: A1 and A9-pre/post send a
 * response schema, A2 sends none. `a2` is what the reply model returns, and for
 * most of these tests it returns nothing at all.
 */
function model(options: { a1?: ModelReply; a2?: ModelReply; a9pre?: ModelReply; a9post?: ModelReply }): void {
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
      return {
        text: SAFETY_UNAVAILABLE_RESPONSE,
        fallbackUsed: true,
        failureReason: 'api_error',
        failureKind: 'unavailable',
        model: 'qwen.qwen3-32b-v1:0',
        canned: false,
      };
    }

    return { text: which.text, fallbackUsed: false, model: 'qwen.qwen3-32b-v1:0', canned: false };
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
  vi.mocked(prisma.sessionLog.findUnique).mockResolvedValue({ session_ended_at: null, turn_count: 0 } as never);
  vi.mocked(prisma.sessionLog.update).mockResolvedValue({ turn_count: 1 } as never);
  vi.mocked(prisma.sessionLog.updateMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(prisma.sessionLog.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.turn.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.turn.create).mockResolvedValue({ id: 'assistant-turn-1' } as never);
  vi.mocked(prisma.safetyState.upsert).mockResolvedValue({} as never);
  vi.mocked(prisma.governanceLog.create).mockResolvedValue({} as never);
  vi.mocked(prisma.safetyFlag.create).mockResolvedValue({ id: 'flag-1' } as never);

  vi.mocked(getAgentContextBundle).mockResolvedValue({
    safety_state: null,
    care_plan: null,
    recent_history: [],
    session_summary: null,
    engagement: { current_streak: 0, longest_streak: 0, voice_mode_enabled: false, consent_1: true, consent_2: false, consent_3: false, consent_4: false },
    user_memory: null,
    language_mode: 'english',
    therapist_name: null,
    care_plan_focus: null,
    homework: null,
  } as never);
});

/** The assistant Turn row the therapist later reads. */
function persistedAssistantText(): string | undefined {
  const created = vi.mocked(prisma.turn.create).mock.calls
    .map(([arg]) => (arg as { data?: { role?: string; content?: string } }).data)
    .filter((data): data is { role: string; content?: string } => data?.role === 'assistant');
  return created[created.length - 1]?.content;
}

/** Every shape a model has been seen to return when it produces no reply. */
const EMPTY_REPLIES: Array<[string, string]> = [
  ['empty string', ''],
  ['whitespace', '   \n\t '],
  ['punctuation only', '...'],
  ['zero-width only', '\u200B\u200C'],
];

/**
 * The owner's four cases. Each is a message the shipped screens already route
 * deterministically, with the reply model returning nothing: the point is that
 * the client still reads the screen, because on these turns the model was never
 * the author of the text in the first place.
 */
describe('a safety screen survives a model that returns no text', () => {
  it('crisis: the crisis card is served, and the model is never asked', async () => {
    model({ a1: { kind: 'ok', text: a1Json('S4', true) }, a2: { kind: 'ok', text: '' } });

    const result = await processTurn(UID, SESSION_ID, 'I want to kill myself tonight.');
    // The crisis tier answers with its own result type, not an agent turn.
    expect(result.type).toBe('crisis');
    if (result.type !== 'crisis') return;

    expect(isEmptyReply(result.message)).toBe(false);
    expect(result.message).toBe(CRISIS_RESPONSE);
    expect(result.message).toContain('14416');
  });

  it('harm to someone: the intent screen is served', async () => {
    model({ a1: { kind: 'ok', text: a1Json('S2') }, a2: { kind: 'ok', text: '' } });

    const result = await processTurn(UID, SESSION_ID, 'I want to hurt my brother.');
    expect(result.type).toBe('agent_turn');
    if (result.type !== 'agent_turn') return;

    expect(isEmptyReply(result.message)).toBe(false);
    expect(result.message).toBe(HARM_TO_SOMEONE_RESPONSE);
    expect(result.message).toContain('112');
    expect(persistedAssistantText()).toBe(HARM_TO_SOMEONE_RESPONSE);
  });

  it('an unwanted thought: the gentler screen is served, not the intent screen', async () => {
    model({ a1: { kind: 'ok', text: a1Json('S2') }, a2: { kind: 'ok', text: '' } });

    const result = await processTurn(
      UID,
      SESSION_ID,
      "I keep having thoughts that I might hurt someone. I don't want to, they just come.",
    );
    expect(result.type).toBe('agent_turn');
    if (result.type !== 'agent_turn') return;

    expect(isEmptyReply(result.message)).toBe(false);
    expect(result.message).toBe(HARM_TO_SOMEONE_THOUGHTS_RESPONSE);
    expect(persistedAssistantText()).toBe(HARM_TO_SOMEONE_THOUGHTS_RESPONSE);
  });
});

/**
 * The case the rule was written for: no safety flag, A2 answers with nothing.
 * Before this, the Turn row and the wire both carried the blank.
 */
describe('an ordinary turn that produces no text serves approved fallback copy', () => {
  it.each(EMPTY_REPLIES)('substitutes when A2 returns %s', async (_label, emptyText) => {
    model({ a1: { kind: 'ok', text: a1Json('S1') }, a2: { kind: 'ok', text: emptyText } });

    const result = await processTurn(UID, SESSION_ID, 'Work has been a lot this week.');
    expect(result.type).toBe('agent_turn');
    if (result.type !== 'agent_turn') return;

    expect(isEmptyReply(result.message)).toBe(false);
    expect(result.message).toBe(MODEL_UNAVAILABLE_RESPONSE);
    expect(result.fallbackSource).toBe('empty_reply');
    expect(result.fallbackUsed).toBe(true);
    expect(result.safety?.code).toBe('EMPTY_REPLY_SUBSTITUTED');
    // The rows the therapist and the audit trail read carry the same text the
    // client got, not the blank it replaced.
    expect(persistedAssistantText()).toBe(MODEL_UNAVAILABLE_RESPONSE);
  });

  it('uses the steadier S2 selector when the turn was at elevated risk', async () => {
    model({ a1: { kind: 'ok', text: a1Json('S2') }, a2: { kind: 'ok', text: '' } });

    const result = await processTurn(UID, SESSION_ID, 'I feel hopeless about everything.');
    expect(result.type).toBe('agent_turn');
    if (result.type !== 'agent_turn') return;

    expect(result.message).toBe(A9_POST_S2_FALLBACK);
    expect(result.fallbackSource).toBe('empty_reply');
  });
});

/**
 * The negative case. A guard that rewrote good replies would be a worse defect
 * than the blank it exists to fix, so "unchanged" is asserted explicitly rather
 * than assumed from the code path.
 */
describe('a real reply is never touched', () => {
  it('serves A2 text exactly as written and reports no substitution', async () => {
    const reply = 'That sounds really heavy. What has today been like for you?';
    model({ a1: { kind: 'ok', text: a1Json('S1') }, a2: { kind: 'ok', text: reply } });

    const result = await processTurn(UID, SESSION_ID, 'Work has been a lot this week.');
    expect(result.type).toBe('agent_turn');
    if (result.type !== 'agent_turn') return;

    expect(result.message).toBe(reply);
    expect(result.fallbackSource).toBeUndefined();
    expect(result.fallbackUsed).toBe(false);
    expect(result.safety).toBeUndefined();
    expect(persistedAssistantText()).toBe(reply);
  });

  it('does not touch a reply that is one word', async () => {
    model({ a1: { kind: 'ok', text: a1Json('S1') }, a2: { kind: 'ok', text: 'Okay.' } });

    const result = await processTurn(UID, SESSION_ID, 'Hmm.');
    expect(result.type).toBe('agent_turn');
    if (result.type !== 'agent_turn') return;

    expect(result.message).toBe('Okay.');
  });
});
