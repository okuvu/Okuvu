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
}));

vi.mock('../agents/a12/agent.js', () => ({
  renderText: vi.fn(),
}));

vi.mock('../lib/agent-context.js', () => ({
  getAgentContextBundle: vi.fn(),
}));

vi.mock('../pipeline/session.js', () => ({
  isSessionClosed: vi.fn(),
  getSessionCount: vi.fn(),
  incrementTurnCount: vi.fn(),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    sessionLog: { findUnique: vi.fn(), update: vi.fn() },
    turn: { createMany: vi.fn(), findFirst: vi.fn() },
    safetyState: { upsert: vi.fn() },
  },
}));

import { classifySafety } from '../agents/a1/agent.js';
import { classifyGovernance } from '../agents/a9/agent.js';
import { routeTurn } from '../agents/a8-router.js';
import { handleTurn } from '../agents/a2/agent.js';
import { renderText } from '../agents/a12/agent.js';
import { getAgentContextBundle } from '../lib/agent-context.js';
import { isSessionClosed, getSessionCount, incrementTurnCount } from '../pipeline/session.js';
import { prisma } from '../lib/prisma.js';
import { processTurn } from '../pipeline/orchestrator.js';

const UID = 'test-user-1';
const SESSION_ID = 'test-session-1';

const defaultContext = {
  safety_state: null,
  care_plan: { care_plan_id: 'CP1' as const, assignment_state: 'provisional' as const },
  recent_history: [],
  session_summary: null,
  engagement: { streak: 0, voice_enabled: false },
};

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(isSessionClosed).mockResolvedValue(false);
  vi.mocked(getSessionCount).mockResolvedValue(3);
  vi.mocked(incrementTurnCount).mockResolvedValue(4);
  vi.mocked(getAgentContextBundle).mockResolvedValue(defaultContext);
  vi.mocked(prisma.sessionLog.findUnique).mockResolvedValue({ turn_count: 3 } as never);
  vi.mocked(prisma.turn.createMany).mockResolvedValue({ count: 2 } as never);
  vi.mocked(prisma.turn.findFirst).mockResolvedValue({ id: 'assistant-turn-1' } as never);
  vi.mocked(prisma.safetyState.upsert).mockResolvedValue({} as never);
  vi.mocked(prisma.sessionLog.update).mockResolvedValue({ turn_count: 4 } as never);
});

describe('processTurn — normal flow', () => {
  it('executes all agents and returns AGENT_TURN', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S2', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue({ response: 'I hear you.', fallbackUsed: false });
    vi.mocked(renderText).mockResolvedValue({ text: 'I hear you, tell me more.', fallbackUsed: false, provider: 'gemini' });

    const result = await processTurn(UID, SESSION_ID, 'I feel anxious');

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.message).toBe('I hear you, tell me more.');
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
    expect(renderText).toHaveBeenCalledTimes(1);
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
    vi.mocked(handleTurn).mockResolvedValue({ response: 'Ok.', fallbackUsed: false });
    vi.mocked(renderText).mockResolvedValue({ text: 'Ok.', fallbackUsed: false, provider: 'gemini' });

    await processTurn(UID, SESSION_ID, 'test');

    expect(a1Start).toBeLessThan(a9End);
    expect(a9Start).toBeLessThan(a1End);
  });
});

describe('processTurn — crisis short-circuit', () => {
  it('returns crisis and does NOT call A2 or A12', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S4', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'crisis' });

    const result = await processTurn(UID, SESSION_ID, 'I want to hurt myself');

    expect(result.type).toBe('crisis');
    expect(handleTurn).not.toHaveBeenCalled();
    expect(renderText).not.toHaveBeenCalled();
  });
});

describe('processTurn — A1 timeout', () => {
  it('uses A1 fallback S2 when A1 throws and continues pipeline', async () => {
    vi.mocked(classifySafety).mockRejectedValue(new Error('A1 timeout'));
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue({ response: 'I hear you.', fallbackUsed: false });
    vi.mocked(renderText).mockResolvedValue({ text: 'I hear you.', fallbackUsed: false, provider: 'gemini' });

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
    vi.mocked(handleTurn).mockResolvedValue({ response: 'I hear you.', fallbackUsed: false });
    vi.mocked(renderText).mockResolvedValue({ text: 'I hear you.', fallbackUsed: false, provider: 'gemini' });

    const result = await processTurn(UID, SESSION_ID, 'test');

    expect(result.type).toBe('agent_turn');
    expect(routeTurn).toHaveBeenCalledWith(
      expect.objectContaining({ governance_state: 'Restricted' }),
    );
    expect(handleTurn).toHaveBeenCalledTimes(1);
  });
});

describe('processTurn — A2 failure', () => {
  it('returns a graceful degraded response when A2 throws', async () => {
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
  });
});

describe('processTurn — A12 failure', () => {
  it('falls back to A2 raw output when A12 throws', async () => {
    vi.mocked(classifySafety).mockResolvedValue({ safetyState: 'S2', fallbackUsed: false });
    vi.mocked(classifyGovernance).mockResolvedValue({ governanceState: 'Active', fallbackUsed: false });
    vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
    vi.mocked(handleTurn).mockResolvedValue({ response: 'A2 raw output', fallbackUsed: false });
    vi.mocked(renderText).mockRejectedValue(new Error('A12 error'));

    const result = await processTurn(UID, SESSION_ID, 'test');

    expect(result.type).toBe('agent_turn');
    if (result.type === 'agent_turn') {
      expect(result.message).toBe('A2 raw output');
      expect(result.fallbackUsed).toBe(true);
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
    vi.mocked(handleTurn).mockResolvedValue({ response: 'Thanks.', fallbackUsed: false });
    vi.mocked(renderText).mockResolvedValue({ text: 'Thanks.', fallbackUsed: false, provider: 'gemini' });

    await processTurn(UID, SESSION_ID, 'I feel better');

    expect(incrementTurnCount).toHaveBeenCalledWith(SESSION_ID);
    expect(prisma.turn.createMany).toHaveBeenCalled();
    expect(prisma.safetyState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: UID },
        update: { safety_state_current: 'S1' },
      }),
    );
  });
});
