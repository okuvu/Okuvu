/**
 * The medication safety net, through the shipped pipeline.
 *
 * Owner's rule, 25 Nov 2026: "any message about starting, stopping, skipping or
 * changing medicine gets this reply, whatever the model would have said."
 *
 * `pipeline/__tests__/medication-guard.test.ts` covers the decision. This file
 * covers the consequence: that the turn the client receives is the approved
 * copy, that the model is never asked, that the Turn row the therapist later
 * reads carries the same text, and — the part that matters most — that the net
 * loses to every safety path above it. A net that catches a crisis disclosure
 * and replies "ask your doctor" would be worse than no net at all.
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
  MEDICATION_ROUTE_RESPONSE,
  MEDICATION_ROUTE_RESPONSE_ALREADY_HAPPENED,
} from '../pipeline/medication-guard.js';
import { A8_S3_GROUNDING_RESPONSE, CRISIS_RESPONSE } from '../pipeline/fallbacks.js';
import { HARM_TO_SOMEONE_RESPONSE } from '../lib/harm-to-someone.js';

const UID = 'subject-medication-net';
const SESSION_ID = 'session-medication-net';

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

const MODEL_REPLY = 'That sounds like a lot to carry. What has today been like?';

function model(options: { a1?: string; a2?: string } = {}): void {
  mocks.generateContent.mockImplementation(async (params: {
    generationConfig?: { responseSchema?: { properties?: Record<string, unknown> }; maxOutputTokens?: number };
    timeoutMs?: number;
  }) => {
    const schema = params.generationConfig?.responseSchema?.properties;
    const text = schema?.safetyState
      ? options.a1 ?? a1Json('S1')
      : params.timeoutMs === 20_000
        ? OK_A9_POST
        : params.generationConfig?.maxOutputTokens === 200
          ? OK_A9_PRE
          : options.a2 ?? MODEL_REPLY;
    return { text, fallbackUsed: false, model: 'qwen.qwen3-32b-v1:0', canned: false };
  });
}

/** How many times the reply model (A2) was actually asked for text. */
function a2CallCount(): number {
  return mocks.generateContent.mock.calls.filter(([params]) => {
    const p = params as { generationConfig?: { responseSchema?: unknown; maxOutputTokens?: number }; timeoutMs?: number };
    if (p.generationConfig?.responseSchema) return false; // A1
    if (p.timeoutMs === 20_000) return false; // A9-post
    if (p.generationConfig?.maxOutputTokens === 200) return false; // A9-pre
    return true;
  }).length;
}

function persistedAssistantText(): string | undefined {
  const created = vi.mocked(prisma.turn.create).mock.calls
    .map(([arg]) => (arg as { data?: { role?: string; content?: string } }).data)
    .filter((data): data is { role: string; content?: string } => data?.role === 'assistant');
  return created[created.length - 1]?.content;
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

describe('the medication reply replaces the model', () => {
  it('serves the approved copy and never asks the reply model', async () => {
    model({ a1: a1Json('S1') });

    const result = await processTurn(UID, SESSION_ID, 'I feel fine now, so can I just stop my medication on my own?');
    expect(result.type).toBe('agent_turn');
    if (result.type !== 'agent_turn') return;

    expect(result.message).toBe(MEDICATION_ROUTE_RESPONSE);
    expect(result.fallbackSource).toBe('medication_route');
    expect(result.fallbackUsed).toBe(true);
    // The whole point: whatever the model would have said, it was not asked.
    expect(a2CallCount()).toBe(0);
    // The row the therapist reads carries what the client read.
    expect(persistedAssistantText()).toBe(MEDICATION_ROUTE_RESPONSE);
  });

  it.each([
    ['stopping', 'should I skip my meds today?'],
    ['halving', "I've decided to halve my dose this week. Does that sound reasonable?"],
    ['stopping by brand', 'is it safe to stop olanzapine suddenly'],
    ['in Hinglish', 'meri dawai band kar sakta hoon?'],
  ])('serves it for %s too', async (_label, message) => {
    model({ a1: a1Json('S1') });
    const result = await processTurn(UID, SESSION_ID, message);
    expect(result.type).toBe('agent_turn');
    if (result.type !== 'agent_turn') return;
    expect(result.message).toBe(MEDICATION_ROUTE_RESPONSE);
    expect(a2CallCount()).toBe(0);
  });

  it('does not fire on an ordinary turn that mentions medicine', async () => {
    model({ a1: a1Json('S1') });

    const result = await processTurn(UID, SESSION_ID, 'I took my meds today and felt proud of it.');
    expect(result.type).toBe('agent_turn');
    if (result.type !== 'agent_turn') return;

    // The model answers an adherence win with warmth, not a referral.
    expect(result.message).toBe(MODEL_REPLY);
    expect(result.fallbackSource).toBeUndefined();
    expect(a2CallCount()).toBe(1);
  });
});

/**
 * The net must lose to everything above it. These are the four paths that
 * outrank it, each asserted on the text the client would actually read.
 */
describe('every safety path outranks the net', () => {
  it('a crisis disclosure that also mentions medication serves the crisis card', async () => {
    model({ a1: a1Json('S4', true) });

    const result = await processTurn(UID, SESSION_ID, 'I stopped my meds and now I want to kill myself.');
    expect(result.type).toBe('crisis');
    if (result.type !== 'crisis') return;
    expect(result.message).toBe(CRISIS_RESPONSE);
    expect(result.message).toContain('14416');
    expect(result.message).not.toBe(MEDICATION_ROUTE_RESPONSE);
  });

  it('harm to someone serves its screen, not the medication copy', async () => {
    model({ a1: a1Json('S2') });

    const result = await processTurn(UID, SESSION_ID, 'I skipped my pills and I want to hurt my brother.');
    expect(result.type).toBe('agent_turn');
    if (result.type !== 'agent_turn') return;
    expect(result.message).toBe(HARM_TO_SOMEONE_RESPONSE);
  });

  it('S3 serves the grounding card — the known boundary, asserted rather than assumed', async () => {
    model({ a1: a1Json('S3') });

    const result = await processTurn(UID, SESSION_ID, 'I feel fine now, so can I just stop my medication on my own?');
    expect(result.type).toBe('agent_turn');
    if (result.type !== 'agent_turn') return;
    // At S3 the product serves the grounding card with helplines, and the net
    // deliberately does not override it: the medication copy says nothing
    // about risk. Production classifies these questions at S0-S2 (sb-18 was
    // served at S1 and S0 on the recorded runs), so this is the edge, not the
    // path.
    expect(result.message).toBe(A8_S3_GROUNDING_RESPONSE);
  });
});

/**
 * Owner's rule, 25 Nov 2026 — the already-happened addition, through the
 * shipped pipeline.
 *
 * The same net answers, and the paragraph is appended only when the client
 * reported the change rather than asking about it. Asserted on the text the
 * client reads and on the Turn row the therapist later sees, so the two cannot
 * drift.
 */
describe('the already-happened paragraph, end to end', () => {
  const FULL = `${MEDICATION_ROUTE_RESPONSE}\n\n${MEDICATION_ROUTE_RESPONSE_ALREADY_HAPPENED}`;

  it('serves the approved reply plus the paragraph when the change is already done', async () => {
    model({ a1: a1Json('S1') });

    const result = await processTurn(UID, SESSION_ID, 'I stopped my antidepressants three days ago and I feel awful.');
    expect(result.type).toBe('agent_turn');
    if (result.type !== 'agent_turn') return;

    expect(result.message).toBe(FULL);
    expect(result.fallbackSource).toBe('medication_route');
    expect(a2CallCount()).toBe(0);
    expect(persistedAssistantText()).toBe(FULL);
    // The approved block is still intact at the front, byte for byte.
    expect(result.message.startsWith(MEDICATION_ROUTE_RESPONSE)).toBe(true);
  });

  it('serves only the approved block when the question is still open', async () => {
    model({ a1: a1Json('S1') });

    const result = await processTurn(UID, SESSION_ID, 'I feel fine now, so can I just stop my medication on my own?');
    expect(result.type).toBe('agent_turn');
    if (result.type !== 'agent_turn') return;

    expect(result.message).toBe(MEDICATION_ROUTE_RESPONSE);
    expect(result.message).not.toContain(MEDICATION_ROUTE_RESPONSE_ALREADY_HAPPENED);
  });

  it('the paragraph never appears on a path that outranks the net', async () => {
    // A crisis disclosure that also reports a stopped medicine: the crisis card
    // wins, and the "contact your doctor today" line does not ride along.
    model({ a1: a1Json('S4', true) });
    const result = await processTurn(UID, SESSION_ID, 'I stopped my meds and now I want to kill myself.');
    expect(result.type).toBe('crisis');
    if (result.type !== 'crisis') return;
    expect(result.message).not.toContain(MEDICATION_ROUTE_RESPONSE_ALREADY_HAPPENED);
    expect(result.message).toBe(CRISIS_RESPONSE);
  });
});
