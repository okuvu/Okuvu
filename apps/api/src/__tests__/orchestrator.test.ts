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
  scoreOnboardingTurn: vi.fn(),
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
import { handleTurn, scoreOnboardingTurn } from '../agents/a2/agent.js';
import { a9PostReview } from '../agents/a9-post/agent.js';
import { getAgentContextBundle } from '../lib/agent-context.js';
import { isSessionClosed, getSessionCount, incrementTurnCount, getSessionConversationTurns } from '../pipeline/session.js';
import { prisma } from '../lib/prisma.js';
import { processTurn } from '../pipeline/orchestrator.js';
import { setToolResult, clearToolResult } from '../lib/tool-result-store.js';
import { retrieveRelevantSessions, formatRetrievedContext } from '../lib/memory-retrieval.js';
import { setRetrievedContext, clearRetrievedContext } from '../lib/retrieved-context-cache.js';

const UID = 'test-user-1';
const SESSION_ID = 'test-session-1';

const defaultContext = {
  safety_state: null,
  care_plan: { id: 'cp-1', care_plan_id: 'CP1' as const, assignment_state: 'provisional' as const },
  recent_history: [],
  session_summary: null,
  engagement: { current_streak: 0, longest_streak: 0, voice_mode_enabled: false, consent_1: true, consent_2: false, consent_3: false, consent_4: false },
  user_memory: null,
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
  vi.mocked(a9PostReview).mockResolvedValue({ decision: 'APPROVED', violation_type: null, confidence: 'high' });
  vi.mocked(getSessionConversationTurns).mockResolvedValue([]);

  clearToolResult(SESSION_ID);
  clearRetrievedContext(SESSION_ID);
});

describe('processTurn — normal flow', () => {
  it('executes all agents (A1, A9, A8, A2) and returns AGENT_TURN', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S2', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);

    const result = await processTurn(UID, SESSION_ID, 'I feel anxious');

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.message).toBe('I hear you.');
      expect(result.fallbackUsed).toBe(false);
      expect(result.turnId).toBe('assistant-turn-1');
    }
    expect(classifySafety).toHaveBeenCalledTimes(1);
    expect(classifyGovernance).toHaveBeenCalledTimes(1);
    expect(routeTurn).toHaveBeenCalledWith(
      expect.objectContaining({ governance_state: 'Active' }),
    );
    expect(routeTurn).toHaveBeenCalledTimes(1);
    expect(handleTurn).toHaveBeenCalledTimes(1);
  });

  it('verifies A1 and A9-pre ran in parallel', async () => {
    let a1Start = 0;
    let a1End = 0;
    let a9Start = 0;
    let a9End = 0;

    vi.mocked(classifySafety).mockImplementation(async () => {
      a1Start = performance.now();
      await new Promise((r) => setTimeout(r, 30));
      a1End = performance.now();
      return { safetyState: 'S2', fallbackUsed: false };
    });

    vi.mocked(classifyGovernance).mockImplementation(async () => {
      a9Start = performance.now();
      await new Promise((r) => setTimeout(r, 20));
      a9End = performance.now();
      return { governanceState: 'Active', fallbackUsed: false };
    });

    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);

    await processTurn(UID, SESSION_ID, 'test');

    expect(a1Start).toBeLessThan(a9End);
    expect(a9Start).toBeLessThan(a1End);
  });
});

describe('processTurn — Layer 3 RAG semantic retrieval', () => {
  it('triggers retrieval on Turn 1 and injects context into A2', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S2', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);
    vi.mocked(retrieveRelevantSessions).mockResolvedValue([
      { session_id: 's-1', summary: '{"narrative_summary":"User discussed work stress"}', session_started_at: new Date(), similarity: 0.72 },
    ]);
    vi.mocked(formatRetrievedContext).mockReturnValue('[Relevant past session — 2 days ago]: User discussed work stress');

    vi.mocked(prisma.sessionLog.findUnique).mockResolvedValue({ turn_count: 0 } as never);

    await processTurn(UID, SESSION_ID, 'I feel anxious about work');

    expect(retrieveRelevantSessions).toHaveBeenCalledWith(UID, 'I feel anxious about work', SESSION_ID);
    expect(handleTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        retrievedContext: '[Relevant past session — 2 days ago]: User discussed work stress',
      }),
    );
  });

  it('reuses cached context on subsequent turns without re-retrieval', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S2', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);

    setRetrievedContext(SESSION_ID, '[Relevant past session — 2 days ago]: User discussed work stress');
    vi.mocked(prisma.sessionLog.findUnique).mockResolvedValue({ turn_count: 2 } as never);

    await processTurn(UID, SESSION_ID, 'Still worried');

    expect(retrieveRelevantSessions).not.toHaveBeenCalled();
    expect(handleTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        retrievedContext: '[Relevant past session — 2 days ago]: User discussed work stress',
      }),
    );
  });

  it('handles retrieval failure gracefully with null context and error log', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S2', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);
    vi.mocked(retrieveRelevantSessions).mockRejectedValue(new Error('Vertex AI embedding failed'));

    vi.mocked(prisma.sessionLog.findUnique).mockResolvedValue({ turn_count: 0 } as never);

    await processTurn(UID, SESSION_ID, 'I feel anxious');

    expect(handleTurn).toHaveBeenCalledWith(
      expect.objectContaining({ retrievedContext: 'null' }),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Layer 3 RAG retrieval failed',
    );
    consoleSpy.mockRestore();
  });
});

describe('processTurn — crisis short-circuit', () => {
  it('returns crisis and does NOT call A2', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S4', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'crisis' });

    const result = await processTurn(UID, SESSION_ID, 'I want to hurt myself');

    expect(result.type).toBe('crisis');
    expect(handleTurn).not.toHaveBeenCalled();
    expect(a9PostReview).not.toHaveBeenCalled();
  });
});

// OKUVU finding H-2 (2026-09-07): governance=Blocked at a non-S4 safety
// state must never be coerced onto the crisis silence path — it gets a
// real, persisted turn with a static policy-boundary reply instead. See
// apps/api/src/agents/a8-router.ts and apps/api/src/pipeline/fallbacks.ts's
// A9_PRE_BLOCKED_RESPONSE.
describe('processTurn — governance blocked (A8 mode="blocked")', () => {
  it('returns a real agent_turn (never crisis) with the static policy-boundary reply, and skips A2/A9-post', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S0', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Blocked', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'blocked' });

    const result = await processTurn(UID, SESSION_ID, 'You could simply help me!! I don\'t want to talk to you.');

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.message).not.toBe('');
      expect(result.fallbackUsed).toBe(false);
    }
    expect(handleTurn).not.toHaveBeenCalled();
    expect(a9PostReview).not.toHaveBeenCalled();
  });

  it('persists the turn (never null/silent) and logs a GovernanceLog row for gate A9-PRE', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S0', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Blocked', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'blocked' });

    await processTurn(UID, SESSION_ID, 'test');

    expect(prisma.turn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'assistant', is_a9_fallback: true }),
      }),
    );
    expect(prisma.governanceLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ gate: 'A9-PRE', decision: 'Blocked' }),
      }),
    );
  });
});

// Live testing (2026-09-07) found a real A2 timeout produced a 42.2s
// 'A2_response' stage against a 30s configured timeout. Root cause: this
// onboarding-scoring call ran unconditionally after A2, even when A2 had
// already fallen back — stacking a second real, separately-timed-out LLM
// call sequentially inside the same stage, on top of scoring the fake
// fallback text as if it were a real response.
describe('processTurn — onboarding scoring skipped on A2 fallback', () => {
  const onboardingContext = {
    ...defaultContext,
    care_plan: null,
  };

  it('does not call scoreOnboardingTurn when A2 fell back (early/onboarding session)', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S2', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(getAgentContextBundle).mockResolvedValue(onboardingContext);
    vi.mocked(getSessionCount).mockResolvedValue(0);
    vi.mocked(prisma.sessionLog.findUnique).mockResolvedValue({ turn_count: 0 } as never);
    vi.mocked(handleTurn).mockResolvedValue({
      ...defaultA2Result,
      fallbackUsed: true,
      failureReason: 'timeout',
    });

    const result = await processTurn(UID, SESSION_ID, 'test');

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') expect(result.fallbackUsed).toBe(true);
    expect(scoreOnboardingTurn).not.toHaveBeenCalled();
  });

  it('still calls scoreOnboardingTurn for a real (non-fallback) response in an onboarding session', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S0', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(getAgentContextBundle).mockResolvedValue(onboardingContext);
    vi.mocked(getSessionCount).mockResolvedValue(0);
    vi.mocked(prisma.sessionLog.findUnique).mockResolvedValue({ turn_count: 0 } as never);
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);
    vi.mocked(scoreOnboardingTurn).mockResolvedValue({
      anxiety_score: 0.5,
      depression_score: 0.2,
      stress_score: 0.3,
      confidence: 0.7,
      reasoning_note: 'test',
    });

    await processTurn(UID, SESSION_ID, 'test');

    expect(scoreOnboardingTurn).toHaveBeenCalledTimes(1);
  });
});

describe('processTurn — A1 timeout', () => {
  it('uses A1 fallback S2 when A1 throws and continues pipeline', async () => {
    vi.mocked(classifySafety).mockRejectedValue(new Error('A1 timeout'));
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);

    const result = await processTurn(UID, SESSION_ID, 'test');

    expect(result.type).toBe('agent_turn');
    expect(routeTurn).toHaveBeenCalledWith(
      expect.objectContaining({ safety_state: 'S2' }),
    );
    expect(handleTurn).toHaveBeenCalledTimes(1);
  });
});

describe('processTurn — A9-pre failure', () => {
  it('uses A9 fallback Restricted when A9 throws and continues pipeline', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S0', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockRejectedValue(new Error('A9 timeout'));
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);

    const result = await processTurn(UID, SESSION_ID, 'test');

    expect(result.type).toBe('agent_turn');
    expect(routeTurn).toHaveBeenCalledWith(
      expect.objectContaining({ governance_state: 'Restricted' }),
    );
    expect(handleTurn).toHaveBeenCalledTimes(1);
  });
});

describe('processTurn — A2 failure', () => {
  it('returns graceful degraded response and skips A9-post when A2 throws', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S2', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockRejectedValue(new Error('A2 error'));

    const result = await processTurn(UID, SESSION_ID, 'test');

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.message).toBeTruthy();
      expect(result.fallbackUsed).toBe(true);
      expect(result.message!.length).toBeGreaterThan(10);
    }
    expect(a9PostReview).not.toHaveBeenCalled();
    expect(prisma.turn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // No model call completed at all — nothing to attribute.
        data: expect.objectContaining({ model_version: null, prompt_version: null }),
      }),
    );
  });
});

describe('processTurn — canned-reply model attribution', () => {
  it('does NOT attribute a canned reply to a real model/prompt version on the persisted Turn', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S2', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    // handleTurn reports the resolved model it would have used (per
    // vertex-ai.ts's contract), but canned:true means no real call happened —
    // this must not end up as real Turn.model_version/prompt_version provenance.
    vi.mocked(handleTurn).mockResolvedValue({
      response: 'a canned reply',
      userContent: 'a canned reply',
      signal: null,
      fallbackUsed: false,
      modelVersion: 'gemini-2.5-flash',
      promptVersion: 'v1.0',
      canned: true,
    });
    vi.mocked(a9PostReview).mockResolvedValue({ decision: 'APPROVED', violation_type: null, confidence: 'high' });

    const result = await processTurn(UID, SESSION_ID, 'test');

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.message).toBe('a canned reply');
    }
    expect(prisma.turn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ model_version: null, prompt_version: null }),
      }),
    );
  });

  it('DOES attribute a real (non-canned) reply to its model/prompt version', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S2', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result); // canned: false
    vi.mocked(a9PostReview).mockResolvedValue({ decision: 'APPROVED', violation_type: null, confidence: 'high' });

    await processTurn(UID, SESSION_ID, 'test');

    expect(prisma.turn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ model_version: 'gemini-2.5-flash', prompt_version: 'v1.0' }),
      }),
    );
  });
});

describe('processTurn — A9-post integration', () => {
  it('calls A9-post after A2 and delivers A2 content when APPROVED', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S2', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);
    vi.mocked(a9PostReview).mockResolvedValue({ decision: 'APPROVED', violation_type: null, confidence: 'high' });

    const result = await processTurn(UID, SESSION_ID, 'test');

    expect(a9PostReview).toHaveBeenCalledTimes(1);
    expect(a9PostReview).toHaveBeenCalledWith(
      expect.objectContaining({ userContent: 'I hear you.' }),
    );
    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.message).toBe('I hear you.');
    }
    expect(prisma.turn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: 'assistant',
          model_version: 'gemini-2.5-flash',
          prompt_version: 'v1.0',
        }),
      }),
    );
  });

  it('returns fallback and logs governance when A9-post BLOCKS', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S1', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);
    vi.mocked(a9PostReview).mockResolvedValue({
      decision: 'BLOCKED',
      violation_type: 'direct_advice',
      confidence: 'high',
    });

    const result = await processTurn(UID, SESSION_ID, 'test');

    expect(a9PostReview).toHaveBeenCalledTimes(1);
    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.message).toBe("I'm here with you. Take a breath — what's most on your mind right now?");
    }
    expect(prisma.turn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: 'assistant',
          is_a9_fallback: true,
          // A9-post substituted a static getSafeFallback() string over A2's
          // output — that text isn't model-produced, so attribution clears.
          model_version: null,
          prompt_version: null,
        }),
      }),
    );
    expect(prisma.governanceLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gate: 'A9-POST',
          decision: 'BLOCKED',
          violation_type: 'direct_advice',
        }),
      }),
    );
  });

  it('delivers S2 fallback when A9-post blocks at safety state S2', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S2', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);
    vi.mocked(a9PostReview).mockResolvedValue({
      decision: 'BLOCKED',
      violation_type: 'clinical_diagnostic_language',
      confidence: 'high',
    });

    const result = await processTurn(UID, SESSION_ID, 'test');

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.message).toBe(
        "I want to make sure I'm being helpful right now. Can you tell me a bit more about what you're experiencing?",
      );
    }
  });

  it('fails closed at S2 when A9-post throws', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S2', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);
    vi.mocked(a9PostReview).mockRejectedValue(new Error('A9-post timeout'));

    const result = await processTurn(UID, SESSION_ID, 'test');

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.message).toBe(
        "I want to make sure I'm being helpful right now. Can you tell me a bit more about what you're experiencing?",
      );
    }
    expect(prisma.governanceLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gate: 'A9-POST',
          violation_type: 'a9_post_unavailable_s2',
        }),
      }),
    );
    expect(prisma.turn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ model_version: null, prompt_version: null }),
      }),
    );
  });

  it('fails open at S0 when A9-post throws', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S0', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);
    vi.mocked(a9PostReview).mockRejectedValue(new Error('A9-post timeout'));

    const result = await processTurn(UID, SESSION_ID, 'test');

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.message).toBe('I hear you.');
    }
    expect(prisma.governanceLog.create).not.toHaveBeenCalled();
    // A9-post failed open here (safetyState !== S2) — A2's own content and
    // model/prompt attribution both pass through untouched.
    expect(prisma.turn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ model_version: 'gemini-2.5-flash', prompt_version: 'v1.0' }),
      }),
    );
  });

  it('does not call A9-post when crisis short-circuits', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S4', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'crisis' });

    await processTurn(UID, SESSION_ID, 'I want to hurt myself');

    expect(a9PostReview).not.toHaveBeenCalled();
  });

  it('records A9_post timing in the pipeline', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S1', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);

    const result = await processTurn(UID, SESSION_ID, 'test');

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      const stages = result.timing.map((t) => t.stage);
      expect(stages).toContain('A9_post');
      expect(stages.indexOf('A2_response')).toBeLessThan(stages.indexOf('A9_post'));
    }
  });
});

describe('processTurn — closed session', () => {
  it('returns error when session is already closed', async () => {
    vi.mocked(isSessionClosed).mockResolvedValue(true);

    const result = await processTurn(UID, SESSION_ID, 'test');

    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.errorCode).toBe('SESSION_CLOSED');
    }
    expect(classifySafety).not.toHaveBeenCalled();
  });
});

describe('processTurn — persistence', () => {
  it('persists turn data and safety state on success', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S1', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);

    await processTurn(UID, SESSION_ID, 'I feel better');

    expect(incrementTurnCount).toHaveBeenCalledWith(SESSION_ID);
    expect(prisma.turn.create).toHaveBeenCalledTimes(2);
    expect(prisma.safetyState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: UID },
        update: { safety_state_current: 'S1' },
      }),
    );
  });
});

describe('processTurn — S-06 integration', () => {
  it('passes perceivedIntensity to handleTurn', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S2', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);

    await processTurn(UID, SESSION_ID, 'test', 5);

    expect(handleTurn).toHaveBeenCalledWith(
      expect.objectContaining({ perceivedIntensity: 5 }),
    );
  });

  it('persists crisis_flag_detected when signal flags it', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S2', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue({
      response: 'I hear you.',
      userContent: 'I hear you.',
      signal: {
        signal: 'S-06',
        agent: 'A2',
        turn_number: 1,
        technique_used: null,
        estimated_intensity: 8,
        intensity_direction: 'rising',
        mood_inference: { primary_emotion: 'anxiety', confidence: 'high' },
        session_flags: { crisis_language_detected: true, validation_only_turn: false, technique_refused_by_user: false },
        care_plan_fit: 'well_matched',
      },
      fallbackUsed: false,
      modelVersion: 'gemini-2.5-flash',
      promptVersion: 'v1.0',
      canned: false,
    });

    await processTurn(UID, SESSION_ID, 'test');

    expect(prisma.sessionLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SESSION_ID },
        data: { crisis_flag_detected: true },
      }),
    );
  });

  it('persists care_plan_review_flagged when care_plan_fit is mismatch', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S2', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue({
      response: 'Hmm.',
      userContent: 'Hmm.',
      signal: {
        signal: 'S-06',
        agent: 'A2',
        turn_number: 1,
        technique_used: 'T1',
        estimated_intensity: 3,
        intensity_direction: 'stable',
        mood_inference: { primary_emotion: 'frustration', confidence: 'medium' },
        session_flags: { crisis_language_detected: false, validation_only_turn: false, technique_refused_by_user: false },
        care_plan_fit: 'possible_mismatch',
      },
      fallbackUsed: false,
      modelVersion: 'gemini-2.5-flash',
      promptVersion: 'v1.0',
      canned: false,
    });

    await processTurn(UID, SESSION_ID, 'test');

    expect(prisma.clinicalConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cp-1' },
        data: { care_plan_review_flagged: true },
      }),
    );
  });

  describe('processTurn — tool result injection', () => {
    it('passes toolResultContext to A2 when grounding result is stored', async () => {
      vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S2', fallbackUsed: false });
      vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
      vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
      vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);

      setToolResult(SESSION_ID, {
        tool_type: 'grounding_5431',
        result: {
          see: ['window', 'tree'],
          touch: ['desk'],
          hear: ['fan'],
          smell: ['coffee'],
          taste: ['mint'],
        },
        turn_number: 3,
      });

      await processTurn(UID, SESSION_ID, 'I feel calmer');

      expect(handleTurn).toHaveBeenCalledWith(
        expect.objectContaining({
          toolResultContext: expect.stringContaining('TOOL RESULT'),
        }),
      );
    });

    it('does not pass toolResultContext when no tool result is stored', async () => {
      vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S2', fallbackUsed: false });
      vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
      vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
      vi.mocked(handleTurn).mockResolvedValue(defaultA2Result);

      clearToolResult(SESSION_ID);

      await processTurn(UID, SESSION_ID, 'test');

      expect(handleTurn).toHaveBeenCalledWith(
        expect.not.objectContaining({ toolResultContext: expect.anything() }),
      );
    });
  });
});
