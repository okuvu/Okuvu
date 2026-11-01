import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../agents/a1/agent.js', () => ({
  classifySafety: vi.fn(),
}));

vi.mock('../agents/a9/agent.js', () => ({
  classifyGovernance: vi.fn(),
}));

vi.mock('../agents/a8-router.js', () => ({
  routeTurn: vi.fn(),
}));

vi.mock('../agents/a2/agent.js', () => ({
  handleTurn: vi.fn(),
  formatUserMemory: vi.fn(() => 'null'),
}));

vi.mock('../agents/a9-post/agent.js', () => ({
  a9PostReview: vi.fn(),
}));

vi.mock('../lib/memory-retrieval.js', () => ({
  retrieveRelevantSessions: vi.fn(),
  formatRetrievedContext: vi.fn(),
}));

vi.mock('../lib/agent-context.js', () => ({
  getAgentContextBundle: vi.fn(),
  summariesToConversationTurns: vi.fn(() => []),
}));

vi.mock('../pipeline/session.js', () => ({
  isSessionClosed: vi.fn(),
  getSessionCount: vi.fn(),
  incrementTurnCount: vi.fn(),
  getSessionConversationTurns: vi.fn(),
}));

// E17-S4: the pipeline appends one row to the audit chain per turn
// (`lib/audit-log.ts`). Without a delegate here every turn would log
// `audit_append_failed` and the chain path would go untested in this suite.
vi.mock('../lib/prisma.js', async () => {
  const { makeAuditEventDelegate } = await import('./helpers/in-memory-audit-event.js');
  return {
    prisma: {
      sessionLog: { findUnique: vi.fn(), update: vi.fn() },
      turn: { create: vi.fn() },
      safetyState: { upsert: vi.fn() },
      clinicalConfig: { update: vi.fn(), upsert: vi.fn() },
      governanceLog: { create: vi.fn() },
      user: { findUnique: vi.fn() },
      $transaction: vi.fn(() => Promise.resolve([{ id: 'user-turn-1' }, { id: 'assistant-turn-1' }])),
      auditEvent: makeAuditEventDelegate(),
    },
  };
});

import { classifySafety } from '../agents/a1/agent.js';
import { classifyGovernance } from '../agents/a9/agent.js';
import { routeTurn } from '../agents/a8-router.js';
import { handleTurn } from '../agents/a2/agent.js';
import { a9PostReview } from '../agents/a9-post/agent.js';
import { getAgentContextBundle } from '../lib/agent-context.js';
import { isSessionClosed, getSessionCount, incrementTurnCount, getSessionConversationTurns } from '../pipeline/session.js';
import { prisma } from '../lib/prisma.js';
import { processTurn } from '../pipeline/orchestrator.js';
import { A2_DEGRADED_RESPONSE, A9_PRE_BLOCKED_RESPONSE, getSafeFallback, SAFETY_UNAVAILABLE_RESPONSE } from '../pipeline/fallbacks.js';
import { clearToolResult } from '../lib/tool-result-store.js';
import { clearRetrievedContext } from '../lib/retrieved-context-cache.js';

const UID = 'test-user-1';
const SESSION_ID = 'test-session-1';

const defaultContext = {
  safety_state: null,
  care_plan: { id: 'cp-1', care_plan_id: 'CP1' as const, assignment_state: 'provisional' as const },
  recent_history: [],
  session_summary: null,
  engagement: { current_streak: 0, longest_streak: 0, voice_mode_enabled: false, consent_1: true, consent_2: false, consent_3: false, consent_4: false },
  user_memory: null,
  language_mode: 'english' as const,
  therapist_name: null,
  care_plan_focus: 'anxiety and worry',
  homework: null,
};

const defaultA2Result = {
  response: 'I hear you.',
  userContent: 'I hear you.',
  signal: null,
  fallbackUsed: false,
  modelVersion: 'gemini-2.5-flash',
  promptVersion: 'v1.0',
  canned: false,
};

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(isSessionClosed).mockResolvedValue(false);
  vi.mocked(getSessionCount).mockResolvedValue(3);
  vi.mocked(incrementTurnCount).mockResolvedValue(4);
  vi.mocked(getSessionConversationTurns).mockResolvedValue([]);
  vi.mocked(getAgentContextBundle).mockResolvedValue(defaultContext);
  vi.mocked(prisma.sessionLog.findUnique).mockResolvedValue({ turn_count: 3 } as never);
  vi.mocked(prisma.turn.create).mockResolvedValue({ id: 'assistant-turn-1' } as never);
  vi.mocked(prisma.safetyState.upsert).mockResolvedValue({} as never);
  vi.mocked(prisma.sessionLog.update).mockResolvedValue({ turn_count: 4 } as never);
  vi.mocked(prisma.governanceLog.create).mockResolvedValue({} as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: UID } as never);
  vi.mocked(a9PostReview).mockResolvedValue({ decision: 'APPROVED', violation_type: null, confidence: 'high', notes: null });

  clearToolResult(SESSION_ID);
  clearRetrievedContext(SESSION_ID);
});

describe('processTurn — TH-S10 default path (opts absent)', () => {
  it('produces the same result when called with no 5th argument as before TH-S10', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S2', fallbackUsed: false, crisis_language_detected: false, basis: 'literal', signal_strength: 'medium', notes: null });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false, reasonCode: null, confidence: 'medium', notes: null });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);

    const result = await processTurn(UID, SESSION_ID, 'I feel anxious');

    expect(classifySafety).toHaveBeenCalledTimes(1);
    expect(classifyGovernance).toHaveBeenCalledTimes(1);
    expect(routeTurn).toHaveBeenCalledTimes(1);
    expect(handleTurn).toHaveBeenCalledTimes(1);
    expect(a9PostReview).toHaveBeenCalledTimes(1);

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.message).toBe('I hear you.');
      expect(result.fallbackUsed).toBe(false);
      expect(result.turnCount).toBe(4);
      expect(result.turnId).toBe('assistant-turn-1');
      expect(result.estimatedIntensity).toBeNull();
      expect(result.toolCard).toBeUndefined();
      expect(result.signals).toBeUndefined();
      // A1/A9-pre run in parallel (Promise.allSettled) — which finishes
      // first is a race, not a contract (A1 legitimately does one more
      // await than A9-pre since okuvu-remaining-changes.md §E added a
      // getSessionConversationTurns call, which can flip which settles
      // first even against instantly-resolving mocks). A8/A2/A9-post are
      // genuinely sequential, so only their relative order is asserted.
      const stages = result.timing.map((t) => t.stage);
      expect(stages).toHaveLength(5);
      expect(new Set(stages)).toEqual(new Set(['A1', 'A9_pre', 'A8_router', 'A2_response', 'A9_post']));
      expect(stages.slice(-3)).toEqual(['A8_router', 'A2_response', 'A9_post']);
    }
  });
});

describe('processTurn — TH-S10 injectA1', () => {
  it('skips classifySafety entirely and flows the injected value to A2', async () => {
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false, reasonCode: null, confidence: 'medium', notes: null });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);

    const result = await processTurn(UID, SESSION_ID, 'test', null, {
      testMode: { injectA1: 'S1' },
    });

    expect(classifySafety).not.toHaveBeenCalled();
    expect(handleTurn).toHaveBeenCalledWith(
      expect.objectContaining({ safetyState: 'S1' }),
    );
    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      const stages = result.timing.map((t) => t.stage);
      expect(stages).toContain('A1_skipped');
      expect(stages).not.toContain('A1');
    }
  });
});

describe('processTurn — TH-S10 signalOverride', () => {
  it('overrides the a2_result boundary and changes the returned message', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S1', fallbackUsed: false, crisis_language_detected: false, basis: 'literal', signal_strength: 'medium', notes: null });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false, reasonCode: null, confidence: 'medium', notes: null });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);

    const result = await processTurn(UID, SESSION_ID, 'test', null, {
      testMode: {
        signalOverride: { boundary: 'a2_result', payload: { userContent: 'overridden message' } },
      },
    });

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.message).toBe('overridden message');
    }
  });
});

describe('processTurn — TH-S10 captureSignalBus', () => {
  it('returns a non-empty ordered signal array', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S1', fallbackUsed: false, crisis_language_detected: false, basis: 'literal', signal_strength: 'medium', notes: null });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false, reasonCode: null, confidence: 'medium', notes: null });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);

    const result = await processTurn(UID, SESSION_ID, 'test', null, {
      testMode: { captureSignalBus: true },
    });

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.signals).toBeDefined();
      expect(result.signals!.length).toBeGreaterThan(0);
      const boundaries = result.signals!.map((s) => s.boundary);
      expect(boundaries).toEqual([
        'A1_result',
        'A9_pre_result',
        'A8_decision',
        'A2_result',
        'A9_post_result',
      ]);
    }
  });

  it('still captures A1/A9 signals on the crisis short-circuit path', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S4', fallbackUsed: false, crisis_language_detected: false, basis: 'literal', signal_strength: 'medium', notes: null });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false, reasonCode: null, confidence: 'medium', notes: null });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'crisis' });

    const result = await processTurn(UID, SESSION_ID, 'I want to hurt myself', null, {
      testMode: { captureSignalBus: true },
    });

    expect(result.type).toBe('crisis');
    if (result.type === 'crisis') {
      expect(result.signals).toBeDefined();
      const boundaries = result.signals!.map((s) => s.boundary);
      expect(boundaries).toEqual(['A1_result', 'A9_pre_result', 'A8_decision']);
    }
    expect(handleTurn).not.toHaveBeenCalled();
  });
});

describe('processTurn — TH-S10 faults', () => {
  // E17-S4: this is no longer "the S2 fallback runs the normal pipeline". An A1
  // fault leaves the turn unassessed, so it is served as the governed
  // `safety_unavailable` substitute and A2 is never reached — see the comment on
  // this contract in orchestrator.test.ts.
  it('faults.boundary A1 serves the safety-unavailable fallback without calling the real classifySafety or A2', async () => {
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false, reasonCode: null, confidence: 'medium', notes: null });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);

    const result = await processTurn(UID, SESSION_ID, 'test', null, {
      testMode: { faults: { boundary: 'A1', type: 'timeout' } },
    });

    expect(classifySafety).not.toHaveBeenCalled();
    expect(routeTurn).toHaveBeenCalledWith(
      expect.objectContaining({ safety_state: 'S2' }),
    );
    expect(result.type).toBe('agent_turn');
    expect(handleTurn).not.toHaveBeenCalled();
    if (result.type === 'agent_turn') {
      expect(result.fallbackSource).toBe('safety_unavailable');
      expect(result.message).toBe(SAFETY_UNAVAILABLE_RESPONSE);
      expect(result.safety?.code).toBe('SAFETY_UNAVAILABLE');
    }
  });

  it('faults.boundary A9_pre resolves governanceState to Restricted (never Active) — mvp-v2-engineering-spec.md §5.5 fail-closed guard', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S0', fallbackUsed: false, crisis_language_detected: false, basis: 'literal', signal_strength: 'medium', notes: null });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);

    const result = await processTurn(UID, SESSION_ID, 'test', null, {
      testMode: { faults: { boundary: 'A9_pre', type: 'timeout' } },
    });

    expect(classifyGovernance).not.toHaveBeenCalled();
    expect(routeTurn).toHaveBeenCalledWith(
      expect.objectContaining({ governance_state: 'Restricted' }),
    );
    expect(result.type).toBe('agent_turn');
  });

  it('faults.boundary A2 triggers A2_DEGRADED_RESPONSE via the existing catch block', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S1', fallbackUsed: false, crisis_language_detected: false, basis: 'literal', signal_strength: 'medium', notes: null });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false, reasonCode: null, confidence: 'medium', notes: null });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);

    const result = await processTurn(UID, SESSION_ID, 'test', null, {
      testMode: { faults: { boundary: 'A2', type: 'api_error' } },
    });

    // handleTurn's own mock is never reached because the fault is thrown
    // before it would be called.
    expect(handleTurn).not.toHaveBeenCalled();
    expect(a9PostReview).not.toHaveBeenCalled();
    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.fallbackUsed).toBe(true);
      expect(result.failureReason).toBe('api_error');
      expect(result.message).toBe(A2_DEGRADED_RESPONSE);
    }
  });

  it('propagates A2Output.failureReason through to PipelineResult when A2 itself reports a fallback', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S1', fallbackUsed: false, crisis_language_detected: false, basis: 'literal', signal_strength: 'medium', notes: null });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false, reasonCode: null, confidence: 'medium', notes: null });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue({
      ...defaultA2Result,
      fallbackUsed: true,
      failureReason: 'timeout',
    });

    const result = await processTurn(UID, SESSION_ID, 'test', null, {});

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.fallbackUsed).toBe(true);
      expect(result.failureReason).toBe('timeout');
    }
  });
});

// Distinguishes the assistant turn.create call (second of the two — user +
// assistant in one $transaction) from the user row's call: only the
// assistant create carries a `select` clause.
const selectDiscriminator = { select: { id: true } };

// ─── A4 + B4 regression seeds (OKUVU — Plumbing Fixes & Rationale v1.0) ─────
// A4: "Blocked turns showed a substitute to the user but recorded
// fallbackUsed:false / canned:false." Every static-substitute path must now
// surface fallbackUsed:true + fallbackSource on the result (and persist
// Turn.fallback_source), so the scorecard's zero-tolerance fallback count is
// honest. B4: these freeze the fix — if blocks ever again record as clean
// passes, these fail before any large run does.
describe('A4 — block substitutes are honest fallbacks (B4 regression seed)', () => {
  it('A9-pre blocked mode records fallbackUsed:true + fallbackSource + Turn.fallback_source', async () => {
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'blocked' });

    const result = await processTurn(UID, SESSION_ID, 'test', null, {});

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.fallbackUsed).toBe(true);
      expect(result.fallbackSource).toBe('a9_pre_blocked');
      expect(result.message).toBe(A9_PRE_BLOCKED_RESPONSE);
    }
    expect(prisma.turn.create).toHaveBeenCalledWith({
      // The assistant row is the second create (user + assistant in one
      // $transaction) — the `select` clause only appears on that one.
      ...selectDiscriminator,
      data: expect.objectContaining({
        role: 'assistant',
        fallback_source: 'a9_pre_blocked',
      }),
    });
  });

  it('A9-post BLOCKED substitution records fallbackUsed:true + fallbackSource', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S1', fallbackUsed: false, crisis_language_detected: false, basis: 'literal', signal_strength: 'medium', notes: null });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false, reasonCode: null, confidence: 'medium', notes: null });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);
    vi.mocked(a9PostReview).mockResolvedValue({ decision: 'BLOCKED', violation_type: 'direct_advice', confidence: 'high', notes: null });

    const result = await processTurn(UID, SESSION_ID, 'test', null, {});

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.fallbackUsed).toBe(true);
      expect(result.fallbackSource).toBe('a9_post_blocked');
      expect(result.message).toBe(getSafeFallback('S1'));
    }
    expect(prisma.turn.create).toHaveBeenCalledWith({
      ...selectDiscriminator,
      data: expect.objectContaining({
        role: 'assistant',
        fallback_source: 'a9_post_blocked',
      }),
    });
  });

  it('deterministic-grounding (S3) records fallbackUsed:true + fallbackSource', async () => {
    vi.mocked(routeTurn).mockReturnValue({ agent: 'deterministic-grounding' });

    const result = await processTurn(UID, SESSION_ID, 'test', null, {});

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.fallbackUsed).toBe(true);
      expect(result.fallbackSource).toBe('deterministic_grounding');
    }
    expect(prisma.turn.create).toHaveBeenCalledWith({
      ...selectDiscriminator,
      data: expect.objectContaining({
        role: 'assistant',
        fallback_source: 'deterministic_grounding',
      }),
    });
  });

  it('A9-post unavailable at S2 records fallbackSource a9_post_unavailable', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S2', fallbackUsed: false, crisis_language_detected: false, basis: 'literal', signal_strength: 'medium', notes: null });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false, reasonCode: null, confidence: 'medium', notes: null });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);
    vi.mocked(a9PostReview).mockRejectedValue(new Error('reviewer down'));

    const result = await processTurn(UID, SESSION_ID, 'test', null, {});

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.fallbackUsed).toBe(true);
      expect(result.fallbackSource).toBe('a9_post_unavailable');
      expect(result.message).toBe(getSafeFallback('S2'));
    }
  });
});

// ─── A2 (reset-on-affirmation) regression seed ──────────────────────────────
// Root cause of the reproduced failures: the current session's turns were
// never passed to A2 (fetched for A1's metrics and discarded). These pin the
// wiring: handleTurn.recentHistory must contain the current session's own
// turns, oldest-first.
describe('A2 — current-session history reaches handleTurn (B4 regression seed)', () => {
  it('passes the session\'s own turns into A2 recentHistory alongside past-session summaries', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S0', fallbackUsed: false, crisis_language_detected: false, basis: 'literal', signal_strength: 'medium', notes: null });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false, reasonCode: null, confidence: 'medium', notes: null });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);
    vi.mocked(getSessionConversationTurns).mockResolvedValue([
      { role: 'user' as const, content: 'Can we try the breathing exercise?', created_at: new Date('2026-09-20T10:00:00Z') },
      { role: 'assistant' as const, content: 'Let\u2019s try it together.', created_at: new Date('2026-09-20T10:00:05Z') },
    ]);

    await processTurn(UID, SESSION_ID, 'okay', null, {});

    const call = vi.mocked(handleTurn).mock.calls[0][0];
    const history = call.recentHistory;
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history.some((t) => t.role === 'user' && t.content === 'Can we try the breathing exercise?')).toBe(true);
    expect(history.some((t) => t.role === 'assistant')).toBe(true);
    // The current message is appended by handleTurn, never duplicated by the orchestrator.
    expect(history.some((t) => t.content === 'okay')).toBe(false);
  });
});
