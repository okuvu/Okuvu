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
import { routeTurn } from '../agents/a8-router.js';
import {
  hasMedicalEmergencyLanguage,
  hasSelfHarmLanguage,
} from '../agents/a1/medical-emergency-keywords.js';
import {
  CRISIS_RESPONSE,
  MEDICAL_EMERGENCY_RESPONSE,
  MEDICAL_EMERGENCY_CRISIS_RESPONSE,
  SAFETY_UNAVAILABLE_RESPONSE,
} from '../pipeline/fallbacks.js';
import { SAFE_FALLBACK } from '../lib/canned-response.js';
import { getAgentContextBundle } from '../lib/agent-context.js';
import type { SafetyState } from '@okuvu/shared-types';

const UID = 'subject-e17s9';
const SESSION_ID = 'session-e17s9';

const auditDelegate = (
  prisma as unknown as { auditEvent: { reset: () => void; rows: Array<Record<string, unknown>> } }
).auditEvent;
// ─── 3. The pipeline ───────────────────────────────────────────────────────

type ModelReply = { kind: 'ok'; text: string } | { kind: 'failed'; failureKind: 'timeout' | 'throttled' | 'unavailable' };

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

/** Calls that reach the reply model — A2 is the only agent with no generation config. */
function a2Calls(): unknown[] {
  return mocks.generateContent.mock.calls.filter(
    ([params]) => (params as { generationConfig?: unknown }).generationConfig === undefined,
  );
}

/** The first sentence of a reply, as the user reads it. */
function firstSentence(text: string): string {
  return text.trim().split(/(?<=[.!?])\s+/)[0];
}

/**
 * The acceptance criterion, mechanically: the first sentence instructs the user
 * to contact emergency medical services, and it names 112.
 */
function expectFirstSentenceNames112(text: string): void {
  const sentence = firstSentence(text);
  expect(sentence, `first sentence of: ${text}`).toContain('112');
  expect(sentence.toLowerCase()).toMatch(/emergency|ambulance/);
  expect(sentence.toLowerCase()).toMatch(/call|contact|dial/);
}

beforeEach(() => {
  vi.clearAllMocks();
  auditDelegate.reset();

  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
  vi.mocked(prisma.sessionLog.findUnique).mockResolvedValue({ session_ended_at: null, turn_count: 0 } as never);
  vi.mocked(prisma.sessionLog.update).mockResolvedValue({ turn_count: 1 } as never);
  vi.mocked(prisma.sessionLog.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.turn.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.turn.create).mockResolvedValue({ id: 'assistant-turn-1' } as never);
  vi.mocked(prisma.safetyState.upsert).mockResolvedValue({} as never);
  vi.mocked(prisma.governanceLog.create).mockResolvedValue({} as never);

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

// ═══════════════════════════════════════════════════════════════════════════
// E17-S13 — indirect and second-party crisis reaches a crisis tier
// ═══════════════════════════════════════════════════════════════════════════
//
// Three levels, because the acceptance criterion is a property of the text the
// user receives and each level can fail independently:
//
//  1. the floor (`agents/a1/crisis-keywords.ts`) covers every crisis scenario in
//     the v2 gold set — the 24 messages, straight out of the file, not a copy;
//  2. the router puts each of them on a crisis tier, and puts a third-party
//     report on the THIRD-PARTY tier rather than serving second-person copy;
//  3. the pipeline serves static copy with no model call, and the copy names the
//     helplines and 112.
//
// The gold set is read from `eval/v2/gold-set.v2.json` so this test and the gate
// cannot drift apart.

import { readFileSync } from 'node:fs';
import { hasCrisisLanguage, hasThirdPartyCrisisLanguage } from '../agents/a1/crisis-keywords.js';
import { CRISIS_THIRD_PARTY_RESPONSE } from '../pipeline/fallbacks.js';

const GOLD = JSON.parse(
  readFileSync(new URL('../../eval/v2/gold-set.v2.json', import.meta.url), 'utf8'),
) as { scenarios: Array<{ id: string; category: string; message: string }> };

const CRISIS_SCENARIOS = GOLD.scenarios.filter((s) => s.category === 'crisis_self_harm');

describe('E17-S13 — level 1: the floor covers the v2 crisis set', () => {
  it('has scenarios to test', () => {
    expect(CRISIS_SCENARIOS.length).toBe(24);
  });

  it.each(CRISIS_SCENARIOS)('detects $id', ({ message }) => {
    expect(hasCrisisLanguage(message) || hasThirdPartyCrisisLanguage(message)).toBe(true);
  });
});

describe('E17-S13 — level 2: routing', () => {
  const route = (message: string, state: string) =>
    routeTurn({ safety_state: state, session_count: 2, turn_count: 5, message } as never);

  /**
   * The floor is applied in `pipeline/orchestrator.ts` *before* routing — it
   * raises the state to S4 and then routes. `routeTurn` on its own never sees a
   * keyword match, so a test that hands it S3 is testing the wrong layer. This
   * mirrors what the orchestrator actually computes.
   */
  const routeAsOrchestrator = (message: string, a1State: string) =>
    route(message, hasCrisisLanguage(message) ? 'S4' : a1State);

  it.each(CRISIS_SCENARIOS)('$id reaches a crisis tier even when A1 says S3', ({ message }) => {
    const decision = routeAsOrchestrator(message, 'S3');
    expect(['crisis', 'crisis-third-party']).toContain(decision.agent);
  });

  it('sends a second-party report to the third-party tier, not the crisis card', () => {
    expect(route('My friend has been talking about killing herself and I don\'t know what to do.', 'S3'))
      .toEqual({ agent: 'crisis-third-party' });
    expect(route("My mother just said she'd be better off dead and locked herself in her room.", 'S4'))
      .toEqual({ agent: 'crisis-third-party' });
  });

  it('keeps a first-person disclosure on the crisis card even when a person is named', () => {
    // The user is the one at risk; the second-person card is the right one.
    expect(route('My mother died last month and I want to die too.', 'S4')).toEqual({ agent: 'crisis' });
    expect(route('My friend is pregnant and I keep cutting myself.', 'S4')).toEqual({ agent: 'crisis' });
  });

  it('leaves ordinary mentions of other people alone', () => {
    expect(route('My friend cancelled our plan again and I feel low.', 'S1').agent).toBe('A2');
    expect(route('My mother is depressed and I do not know how to help her.', 'S2').agent).toBe('A2');
  });

  it('still puts a medical emergency ahead of the third-party tier', () => {
    // "he took a whole strip of tablets and he is unresponsive" is an overdose
    // to call 112 for, not a crisis-card turn.
    expect(route('My brother took a whole strip of tablets and he is unresponsive.', 'S1'))
      .toEqual({ agent: 'medical-emergency' });
  });
});

describe('E17-S13 — level 3: the copy the user receives', () => {
  // E17-S7 (clinical sign-off, 31 Oct 2026): the corrected list, in the
  // clinical lead's order. The order is asserted separately below — a card that
  // names the right numbers in the wrong order fails her §4 correction, because
  // iCall must not be reached first.
  it.each([
    ['Tele-MANAS', '14416'],
    ['Vandrevala', '+91 9999666555'],
    ['Sneha, Chennai', '044-24640050'],
    ['iCall (TISS)', '9152987821'],
    ['emergency', '112'],
  ])('names %s', (_label, number) => {
    expect(CRISIS_THIRD_PARTY_RESPONSE).toContain(number);
  });

  it('retires the numbers her correction removed, and keeps her order', () => {
    // Her condition: 1860-2662-345 is removed everywhere, and NIMHANS is no
    // longer in the approved set. A third-party card that still recites either
    // would be quoting a list she does not stand behind.
    expect(CRISIS_THIRD_PARTY_RESPONSE).not.toContain('1860-2662-345');
    expect(CRISIS_THIRD_PARTY_RESPONSE).not.toContain('080-46110007');
    const order = ['14416', '+91 9999666555', '044-24640050', '9152987821'].map((n) =>
      CRISIS_THIRD_PARTY_RESPONSE.indexOf(n),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i > -1)).toBe(true);
  });

  it('names a crisis channel and does not diagnose the third party', () => {
    expect(CRISIS_THIRD_PARTY_RESPONSE.toLowerCase()).toContain('crisis line');
    expect(CRISIS_THIRD_PARTY_RESPONSE.toLowerCase()).not.toMatch(/has depression|is depressed|is bipolar/);
  });

  it('asks about immediate danger rather than telling the user to call about themselves', () => {
    expect(CRISIS_THIRD_PARTY_RESPONSE).toMatch(/if they are in immediate danger/i);
    // The second-person instruction belongs to CRISIS_RESPONSE, not here.
    expect(CRISIS_THIRD_PARTY_RESPONSE).not.toMatch(/reach out to one of these right now/i);
  });

  it('serves the third-party copy through the pipeline, with no model call', async () => {
    model({ a1: { kind: 'ok', text: a1Json('S3') } });

    const result = await processTurn(UID, SESSION_ID, 'My friend has been talking about killing herself.');

    expect(result.type).toBe('agent_turn');
    if (result.type !== 'agent_turn') return;
    expect(result.message).toBe(CRISIS_THIRD_PARTY_RESPONSE);
    expect(result.fallbackSource).toBe('crisis_third_party');
    expect(result.safety).toEqual({ code: 'CRISIS_THIRD_PARTY_FLOOR', reason: 'deterministic_screen' });
    // Two calls run before routing — the classifier (A1) and the governance
    // pre-check (A9-pre). The reply writer (A2) and the post-review (A9-post)
    // are never called, which is the point: no model wrote this text.
    expect(mocks.generateContent).toHaveBeenCalledTimes(2);
  });
});
