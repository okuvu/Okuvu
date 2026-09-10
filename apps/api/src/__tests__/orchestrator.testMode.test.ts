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
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    sessionLog: { findUnique: vi.fn(), update: vi.fn() },
    turn: { create: vi.fn() },
    safetyState: { upsert: vi.fn() },
    clinicalConfig: { update: vi.fn(), upsert: vi.fn() },
    governanceLog: { create: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(() => Promise.resolve([{ id: 'user-turn-1' }, { id: 'assistant-turn-1' }])),
  },
}));

import { classifySafety } from '../agents/a1/agent.js';
import { classifyGovernance } from '../agents/a9/agent.js';
import { routeTurn } from '../agents/a8-router.js';
import { handleTurn } from '../agents/a2/agent.js';
import { a9PostReview } from '../agents/a9-post/agent.js';
import { getAgentContextBundle } from '../lib/agent-context.js';
import { isSessionClosed, getSessionCount, incrementTurnCount } from '../pipeline/session.js';
import { prisma } from '../lib/prisma.js';
import { processTurn } from '../pipeline/orchestrator.js';
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
      const stages = result.timing.map((t) => t.stage);
      expect(stages).toEqual(['A1', 'A9_pre', 'A8_router', 'A2_response', 'A9_post']);
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
  it('faults.boundary A1 triggers the existing S2 fallback without calling the real classifySafety', async () => {
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
    expect(handleTurn).toHaveBeenCalledWith(
      expect.objectContaining({ safetyState: 'S2' }),
    );
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
      expect(result.message).toBe(
        "I hear you, and I'm here to support you. Could you tell me a bit more about what's going on right now?",
      );
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
