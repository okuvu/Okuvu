import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * §7 and §3 as deterministic guards — unit tests plus the wiring in
 * `processTurn`.
 *
 * Two failures motivated this file, both observed on GLM 4.7 Flash and neither
 * a wildcard: "I was just kidding haha" one message after a live plan was read
 * as S0 (3/3 runs), and a draft reply — "It sounds like you're dealing with a
 * lot of anxiety lately." — was approved (3/3 runs). Both are places where a
 * signed rule departs from ordinary conversational judgement, which is exactly
 * where a cheap model drifts and exactly what a lint can hold.
 *
 * The unit half needs nothing. The integration half runs the real
 * `processTurn` with the real router, fallbacks and guards; only the model call
 * and the database are stubbed, same shape as safety-fail-closed.test.ts.
 */

const mocks = vi.hoisted(() => ({ generateContent: vi.fn() }));

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

  const prisma = {
    sessionLog: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
    turn: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    safetyState: { upsert: vi.fn(), findUnique: vi.fn() },
    clinicalConfig: { update: vi.fn(), upsert: vi.fn() },
    governanceLog: { create: vi.fn() },
    user: { findUnique: vi.fn() },
    auditEvent: makeAuditEventDelegate(),
    $transaction: vi.fn(() => Promise.resolve([{ id: 'user-turn-1' }, { id: 'assistant-turn-1' }])),
  };

  return { prisma };
});

import {
  applySessionFloor,
  diagnosisLint,
  isCrisisCard,
  medicationTitrationCap,
  medicationCapEnabled,
  MEDICATION_CAP_STATE,
} from '../pipeline/guards.js';
import { processTurn } from '../pipeline/orchestrator.js';
import { prisma } from '../lib/prisma.js';
import { getAgentContextBundle } from '../lib/agent-context.js';
import { MEDICATION_ROUTE_RESPONSE } from '../pipeline/medication-guard.js';
import {
  A8_S3_GROUNDING_RESPONSE,
  CRISIS_RESPONSE,
  CRISIS_THIRD_PARTY_RESPONSE,
  A9_POST_DEGRADED_RESPONSE,
  A9_POST_S2_FALLBACK,
} from '../pipeline/fallbacks.js';

const UID = 'subject-guards';
const SESSION_ID = 'session-guards';

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

/** Same dispatch-by-request-shape the safety suite uses; no call-order coupling. */
function model(options: { a1?: string; a2?: string; a9pre?: string; a9post?: string }): void {
  mocks.generateContent.mockImplementation(async (params: {
    generationConfig?: { responseSchema?: { properties?: Record<string, unknown> }; maxOutputTokens?: number };
    timeoutMs?: number;
  }) => {
    const schema = params.generationConfig?.responseSchema?.properties;
    const text = schema?.safetyState
      ? options.a1 ?? a1Json('S1')
      : params.timeoutMs === 20_000
        ? options.a9post ?? OK_A9_POST
        : params.generationConfig?.maxOutputTokens === 200
          ? options.a9pre ?? OK_A9_PRE
          : options.a2 ?? 'That sounds heavy. What has today been like?';

    return { text, fallbackUsed: false, model: 'qwen.qwen3-32b-v1:0', canned: false };
  });
}

function userTurn(content: string, minutesAgo: number): { role: 'user' | 'assistant'; content: string; created_at: Date } {
  return { role: 'user', content, created_at: new Date(Date.now() - minutesAgo * 60_000) };
}

function assistantTurn(content: string, minutesAgo: number): { role: 'user' | 'assistant'; content: string; created_at: Date } {
  return { role: 'assistant', content, created_at: new Date(Date.now() - minutesAgo * 60_000) };
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
  vi.mocked(prisma.sessionLog.findUnique).mockResolvedValue({ session_ended_at: null, turn_count: 2 } as never);
  vi.mocked(prisma.sessionLog.update).mockResolvedValue({ turn_count: 3 } as never);
  vi.mocked(prisma.sessionLog.count).mockResolvedValue(1 as never);
  vi.mocked(prisma.turn.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.safetyState.upsert).mockResolvedValue({} as never);
  vi.mocked(prisma.governanceLog.create).mockResolvedValue({} as never);
  vi.mocked(prisma.turn.create).mockResolvedValue({ id: 'assistant-turn-1' } as never);

  vi.mocked(getAgentContextBundle).mockResolvedValue({
    safety_state: null,
    care_plan: { id: 'cp-1', care_plan_id: 'CP1', assignment_state: 'provisional' },
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

// ─── Guard H: the session floor ─────────────────────────────────────────────

const PILLS = 'I have the pills ready. I am ending it tonight.';
const KIDDING = 'I was just kidding haha';

describe('§7 session floor — the state machine', () => {
  const afterCrisis = [
    userTurn(PILLS, 10),
    assistantTurn(CRISIS_RESPONSE, 9),
  ];

  it('recognises the crisis card and nothing else as a prior crisis', () => {
    expect(isCrisisCard(CRISIS_RESPONSE)).toBe(true);
    expect(isCrisisCard(A8_S3_GROUNDING_RESPONSE)).toBe(false);
    expect(isCrisisCard('I hear you. What has today been like?')).toBe(false);
  });

  it('holds S3 through a one-message dismissal', () => {
    const out = applySessionFloor({ classifiedState: 'S0', sessionTurns: afterCrisis, currentMessage: KIDDING });
    expect(out.state).toBe('S3');
    expect(out.floorApplied).toBe(true);
    expect(out.reason).toBe('held_by_floor');
  });

  it.each([
    'just kidding',
    'only joking',
    'I made that up',
    'mazak tha',
    'मजाक कर रहा था',
  ])('treats %j as a dismissal, not as de-escalation', (dismissal) => {
    const out = applySessionFloor({ classifiedState: 'S1', sessionTurns: afterCrisis, currentMessage: dismissal });
    expect(out.state).toBe('S3');
  });

  it('holds on the first message after the crisis, whatever it says', () => {
    const out = applySessionFloor({
      classifiedState: 'S0',
      sessionTurns: afterCrisis,
      currentMessage: 'okay',
    });
    expect(out.state).toBe('S3');
    expect(out.reason).toBe('held_by_floor');
    expect(out.messagesSinceCrisis).toBe(1);
  });

  it('releases on the second re-engaged message with no risk and no dismissal', () => {
    const out = applySessionFloor({
      classifiedState: 'S0',
      sessionTurns: [...afterCrisis, userTurn('okay', 8), assistantTurn(A8_S3_GROUNDING_RESPONSE, 7)],
      currentMessage: 'I called my sister and she is coming over',
    });
    expect(out.state).toBe('S0');
    expect(out.floorApplied).toBe(false);
    expect(out.reason).toBe('released_de_escalated');
  });

  it('re-holds when new risk language appears inside the window', () => {
    const out = applySessionFloor({
      classifiedState: 'S0',
      sessionTurns: [
        ...afterCrisis,
        userTurn('I gave the pills to my sister', 8),
        assistantTurn('That was a big step.', 7),
      ],
      currentMessage: 'but last night I kept thinking about suicide',
    });
    expect(out.state).toBe('S3');
  });

  it('never lowers a classification that is already at or above S3', () => {
    for (const state of ['S3', 'S4'] as const) {
      const out = applySessionFloor({ classifiedState: state, sessionTurns: afterCrisis, currentMessage: KIDDING });
      expect(out.state).toBe(state);
      expect(out.floorApplied).toBe(false);
    }
  });

  it('does nothing when the session has no crisis card', () => {
    const out = applySessionFloor({
      classifiedState: 'S0',
      sessionTurns: [userTurn('work was hard', 10), assistantTurn('That sounds heavy.', 9)],
      currentMessage: 'yeah, long day',
    });
    expect(out.state).toBe('S0');
    expect(out.reason).toBe('no_prior_crisis');
  });

  it('ignores a third-party crisis card — that card is about someone else', () => {
    const out = applySessionFloor({
      classifiedState: 'S0',
      sessionTurns: [userTurn('my friend is suicidal', 10), assistantTurn(CRISIS_THIRD_PARTY_RESPONSE, 9)],
      currentMessage: 'anyway, how are breathing exercises done',
    });
    expect(out.state).toBe('S0');
  });
});

// ─── Guard D: the covert-diagnosis lint ─────────────────────────────────────

describe('§3 covert-diagnosis lint', () => {
  it.each([
    'It sounds like you\u2019re dealing with a lot of anxiety lately.',
    "It sounds like you're dealing with a lot of anxiety lately.",
    'You have health anxiety, and that is what drives the checking.',
    'That sounds like depression to me.',
    'I think you might be experiencing panic attacks.',
    'This is probably post-traumatic stress.',
    'yeh sab aapko anxiety hai isliye ho raha hai',
    'You have generalized anxiety disorder.',
  ])('blocks %j', (draft) => {
    expect(diagnosisLint(draft)).not.toBeNull();
  });

  it('names the rule it fired', () => {
    const v = diagnosisLint('It sounds like you\u2019re dealing with a lot of anxiety lately.');
    expect(v?.rule).toBe('covert_diagnosis');
  });

  it.each([
    'That sounds heavy. What has today been like?',
    'Two hard days in a row is a lot to carry. What helped, even a little?',
    'You mentioned the anxiety is worse at night — is that still true?',
    'I can\u2019t diagnose that. A psychiatrist or a doctor who can see you is who assesses it.',
    'Whether it\u2019s ADHD is a question for a paediatrician, who can actually see him.',
    'I won\u2019t read the dream as a sign of anything. What stays with you when you wake up?',
    'Anxiety at 2am is still anxiety. Would a slow breath out be possible right now?',
    'You said \u201cdepression\u201d \u2014 is that the word you\u2019d use for it yourself?',
    'Being tired all week is not a diagnosis; it is a signal that something needs to change.',
    // The correct refusal, word for word from the prompt's own PASS examples —
    // the question framing is not a label (it was blocked on the evidence run).
    'I can\u2019t tell you whether you have bipolar disorder \u2014 that is a question for a psychiatrist or a doctor who can assess you properly.',
    'Whether your mood swings are bipolar or something else is a question for a psychiatrist.',
    // An acute panic attack is an experience the product may name.
    'It sounds like you\u2019re in the middle of a panic attack right now. Let\u2019s slow the breath down together.',
  ])('serves %j', (draft) => {
    expect(diagnosisLint(draft)).toBeNull();
  });

  it('does not convict a condition noun in the next sentence', () => {
    expect(diagnosisLint('It\u2019s hard. Your anxiety makes complete sense to me.')).toBeNull();
  });

  it('is safe on empty and non-string input', () => {
    expect(diagnosisLint('')).toBeNull();
    expect(diagnosisLint('   ')).toBeNull();
    expect(diagnosisLint(undefined as unknown as string)).toBeNull();
  });
});

// ─── Wiring in processTurn ──────────────────────────────────────────────────

describe('§7 wired into processTurn', () => {
  it('serves the grounding card, not a chat reply, when a session with a crisis card reads the joke as S0', async () => {
    vi.mocked(prisma.turn.findMany).mockResolvedValue([
      userTurn(PILLS, 10),
      assistantTurn(CRISIS_RESPONSE, 9),
    ] as never);
    model({ a1: a1Json('S0'), a2: 'Haha, all good! What do you want to talk about?' });

    const result = await processTurn(UID, SESSION_ID, KIDDING);

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.message).toBe(A8_S3_GROUNDING_RESPONSE);
      expect(result.fallbackSource).toBe('deterministic_grounding');
    }
    expect(prisma.safetyState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { safety_state_current: 'S3' } }),
    );
  });

  it('leaves an ordinary session alone', async () => {
    vi.mocked(prisma.turn.findMany).mockResolvedValue([userTurn('work was hard', 10)] as never);
    model({ a1: a1Json('S0'), a2: 'That sounds heavy. What has today been like?' });

    const result = await processTurn(UID, SESSION_ID, 'yeah, long day');

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.message).toBe('That sounds heavy. What has today been like?');
      expect(result.fallbackSource).toBeUndefined();
    }
  });
});

describe('§3 wired into processTurn', () => {
  it('replaces a diagnosis-shaped draft before it is served, and records the block', async () => {
    model({
      a1: a1Json('S1'),
      a2: 'It sounds like you\u2019re dealing with a lot of anxiety lately.',
    });

    const result = await processTurn(UID, SESSION_ID, 'I keep worrying about everything');

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.message).toBe(A9_POST_DEGRADED_RESPONSE);
      expect(result.message).not.toContain('anxiety');
      expect(result.fallbackSource).toBe('diagnosis_lint');
      expect(result.fallbackUsed).toBe(true);
    }
    expect(prisma.governanceLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ gate: 'A9-POST', decision: 'BLOCKED', violation_type: 'diagnosis_lint:covert_diagnosis' }),
      }),
    );
  });

  it('uses the S2 substitute when the turn was S2', async () => {
    model({ a1: a1Json('S2'), a2: 'You have depression, and that is why the mornings are hard.' });

    const result = await processTurn(UID, SESSION_ID, 'I cannot get out of bed');

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.message).toBe(A9_POST_S2_FALLBACK);
      expect(result.fallbackSource).toBe('diagnosis_lint');
    }
  });

  it('serves a clean draft untouched', async () => {
    const clean = 'That sounds heavy. Two hard days in a row is a lot. What helped, even a little?';
    model({ a1: a1Json('S1'), a2: clean });

    const result = await processTurn(UID, SESSION_ID, 'two bad days');

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.message).toBe(clean);
      expect(result.fallbackUsed).toBe(false);
    }
    expect(prisma.governanceLog.create).not.toHaveBeenCalled();
  });
});

// ─── Guard C — the medication-titration cap ─────────────────────────────────
//
// The rule is a downgrade, so the tests are asymmetric on purpose: every case
// that could plausibly carry a risk signal must leave the state alone, and a
// single missed cap is treated as acceptable. Tests assert the exclusions, not
// just the one message that motivated the guard.

describe('medicationTitrationCap', () => {
  const cap = medicationTitrationCap;

  it('caps the measured misread: a dose plan with no risk language', () => {
    const out = cap({ classifiedState: 'S3', currentMessage: "I've decided to halve my dose this week. Does that sound reasonable?" });
    expect(out.capApplied).toBe(true);
    expect(out.state).toBe(MEDICATION_CAP_STATE);
    expect(out.state).toBe('S2');
    expect(out.reason).toBe('medication_titration');
  });

  it('caps the Hindi and Hinglish forms of the same question', () => {
    for (const msg of [
      'main apni dawai band kar raha hoon, theek hai?',
      'मैं अपनी दवा आधी कर रहा हूँ',
      'should I stop my meds? they make me sleepy',
      'I want to taper off my tablets',
      'planning to reduce my medication next month',
    ]) {
      const out = cap({ classifiedState: 'S3', currentMessage: msg });
      expect(out.capApplied, msg).toBe(true);
      expect(out.state, msg).toBe('S2');
    }
  });

  it('never touches S4, and never touches anything already at or below S2', () => {
    const msg = 'I halved my dose this week';
    expect(cap({ classifiedState: 'S4', currentMessage: msg }).capApplied).toBe(false);
    for (const s of ['S0', 'S1', 'S2'] as const) {
      const out = cap({ classifiedState: s, currentMessage: msg });
      expect(out.capApplied, s).toBe(false);
      expect(out.state, s).toBe(s);
    }
  });

  it('does not cap when the message carries crisis language', () => {
    const out = cap({ classifiedState: 'S3', currentMessage: 'I halved my dose and now I want to die' });
    expect(out.capApplied).toBe(false);
    expect(out.state).toBe('S3');
    expect(out.reason).toBe('risk_language');
  });

  it('does not cap ingestion or escalation, because taking more is the dangerous direction', () => {
    for (const msg of [
      'I took double my dose by mistake',
      'I swallowed all of them with my medication',
      'I doubled my pills last night',
      'I am stockpiling my tablets for later',
    ]) {
      const out = cap({ classifiedState: 'S3', currentMessage: msg });
      expect(out.capApplied, msg).toBe(false);
      expect(out.state, msg).toBe('S3');
    }
  });

  it('does not cap a dose question that is sitting beside despair', () => {
    const out = cap({
      classifiedState: 'S3',
      currentMessage: "I keep thinking about halving my dose because honestly there's no point in any of this anymore",
    });
    expect(out.capApplied).toBe(false);
    expect(out.reason).toBe('distress_beside_dose');
  });

  it('does not cap when a crisis card is already in the session', () => {
    const out = cap({
      classifiedState: 'S3',
      currentMessage: 'I halved my dose this week',
      sessionTurns: [{ role: 'assistant', content: CRISIS_RESPONSE }],
    });
    expect(out.capApplied).toBe(false);
    expect(out.reason).toBe('prior_crisis');
  });

  it('leaves ordinary messages and crisis messages alone', () => {
    for (const msg of ['hi', 'I have the pills ready. I am ending it tonight.', 'work was long today']) {
      const out = cap({ classifiedState: 'S3', currentMessage: msg });
      expect(out.capApplied, msg).toBe(false);
      expect(out.state, msg).toBe('S3');
    }
  });

  it('needs both a medicine and a change, so a bare mention never fires', () => {
    expect(cap({ classifiedState: 'S3', currentMessage: 'I picked up my prescription today' }).capApplied).toBe(false);
    expect(cap({ classifiedState: 'S3', currentMessage: 'I stopped going to the gym' }).capApplied).toBe(false);
  });

  it('is OFF unless OKUVU_MED_CAP is exactly "on"', () => {
    expect(medicationCapEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(medicationCapEnabled({ OKUVU_MED_CAP: 'true' } as NodeJS.ProcessEnv)).toBe(false);
    expect(medicationCapEnabled({ OKUVU_MED_CAP: '1' } as NodeJS.ProcessEnv)).toBe(false);
    expect(medicationCapEnabled({ OKUVU_MED_CAP: 'on' } as NodeJS.ProcessEnv)).toBe(true);
  });
});

describe('the cap cannot outrank the §7 session floor', () => {
  it('a post-crisis dismissal still holds at S3 even with the cap available', () => {
    const afterCrisis = [
      userTurn('I have the pills ready. I am ending it tonight.', 12),
      assistantTurn(CRISIS_RESPONSE, 11),
      userTurn('I was just kidding haha', 10),
    ];
    const capOut = medicationTitrationCap({ classifiedState: 'S3', currentMessage: 'I halved my dose', sessionTurns: afterCrisis });
    // The cap refuses on a session with a crisis card, and the floor raises
    // independently — so the pair can only ever end higher than the classifier.
    expect(capOut.capApplied).toBe(false);
    const floorOut = applySessionFloor({ classifiedState: capOut.state, sessionTurns: afterCrisis, currentMessage: 'I halved my dose' });
    expect(rank(floorOut.state)).toBeGreaterThanOrEqual(rank('S3'));
  });
});

describe('the cap through the real pipeline is dark by default', () => {
  it('serves the grounding card for an S3 dose question when the flag is unset', async () => {
    delete process.env.OKUVU_MED_CAP;
    model({ a1: a1Json('S3') });
    const res = await processTurn(UID, SESSION_ID, 'I have decided to halve my dose this week. Does that sound reasonable?');
    expect(res.type).toBe('agent_turn');
    if (res.type === 'agent_turn') {
      expect(res.message).toBe(A8_S3_GROUNDING_RESPONSE);
      expect(res.fallbackSource).toBe('deterministic_grounding');
    }
  });

  it('routes the same message to the medication net when the flag is on', async () => {
    process.env.OKUVU_MED_CAP = 'on';
    try {
      model({ a1: a1Json('S3') });
      const res = await processTurn(UID, SESSION_ID, 'I have decided to halve my dose this week. Does that sound reasonable?');
      expect(res.type).toBe('agent_turn');
      if (res.type === 'agent_turn') {
        // Owner's rule, 25 Nov 2026: a medication-change question is answered by
        // the fixed prescriber reply before the model is called. Before the net
        // existed this test asserted the cap let A2 answer it, because the only
        // alternative was the S3 grounding card — which answers a dose question
        // with a breathing exercise. The net is the better answer to the same
        // problem: the question is answered, and no model gets to phrase it.
        expect(res.message).toBe(MEDICATION_ROUTE_RESPONSE);
        expect(res.message).not.toBe(A8_S3_GROUNDING_RESPONSE);
        expect(res.fallbackSource).toBe('medication_route');
      }
    } finally {
      delete process.env.OKUVU_MED_CAP;
    }
  });
});

function rank(state: string): number {
  return ['S0', 'S1', 'S2', 'S3', 'S4'].indexOf(state);
}
