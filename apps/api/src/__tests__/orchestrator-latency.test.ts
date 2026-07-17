
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
    turn: {
      createMany: vi.fn(),
      findFirst: vi.fn(),
    },
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

const UID = 'latency-test-user-1';
const SESSION_ID = 'latency-test-session-1';

const defaultContext = {
  safety_state: null,
  care_plan: { care_plan_id: 'CP1' as const, assignment_state: 'provisional' as const },
  recent_history: [],
  session_summary: null,
  engagement: { current_streak: 0, longest_streak: 0, voice_mode_enabled: false, consent_1: true, consent_2: false, consent_3: false, consent_4: false },
};

function simulateLatency(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function setupBaseMocks(): void {
  vi.mocked(isSessionClosed).mockResolvedValue(false);
  vi.mocked(getSessionCount).mockResolvedValue(3);
  vi.mocked(incrementTurnCount).mockResolvedValue(4);
  vi.mocked(getAgentContextBundle).mockResolvedValue(defaultContext);
  vi.mocked(prisma.sessionLog.findUnique).mockResolvedValue({ turn_count: 3 } as never);
  vi.mocked(prisma.turn.createMany).mockResolvedValue({ count: 2 } as never);
  vi.mocked(prisma.turn.findFirst).mockResolvedValue({ id: 'assistant-turn-1' } as never);
  vi.mocked(prisma.safetyState.upsert).mockResolvedValue({} as never);
  vi.mocked(prisma.sessionLog.update).mockResolvedValue({ turn_count: 4 } as never);
  vi.mocked(routeTurn).mockReturnValue({ agent: 'A2', mode: 'normal' });
}

describe('turn pipeline latency benchmark', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBaseMocks();
  });

  const NUM_TURNS = 20;

  it('meets p50 latency target under 2000ms across 20 simulated turns', { timeout: 15000 }, async () => {
    vi.mocked(classifySafety).mockImplementation(async () => {
      await simulateLatency(50);
      return { safetyState: 'S2', fallbackUsed: false };
    });

    vi.mocked(classifyGovernance).mockImplementation(async () => {
      await simulateLatency(35);
      return { governanceState: 'Active', fallbackUsed: false };
    });

    vi.mocked(handleTurn).mockImplementation(async () => {
      await simulateLatency(70);
      return { response: 'I hear you.', fallbackUsed: false };
    });

    vi.mocked(renderText).mockImplementation(async () => {
      await simulateLatency(25);
      return { text: 'I hear you, tell me more.', fallbackUsed: false, provider: 'gemini' };
    });

    const totalTimes: number[] = [];
    const allTimings: Array<Record<string, number>> = [];

    for (let i = 0; i < NUM_TURNS; i++) {
      const turnStart = performance.now();
      const result = await processTurn(UID, SESSION_ID, `Test message ${i}`);
      const turnEnd = performance.now();
      totalTimes.push(turnEnd - turnStart);

      if (result.type === 'agent_turn') {
        const stageMap: Record<string, number> = {};
        for (const s of result.timing) {
          stageMap[s.stage] = s.elapsedMs;
        }
        allTimings.push(stageMap);
      }
    }

    totalTimes.sort((a, b) => a - b);
    const p50 = totalTimes[Math.floor(totalTimes.length * 0.5)];
    const p95 = totalTimes[Math.floor(totalTimes.length * 0.95)];
    const avg = totalTimes.reduce((s, t) => s + t, 0) / totalTimes.length;

    console.log('=== Latency Benchmark Results ===');
    console.log(`Turns simulated: ${NUM_TURNS}`);
    console.log(`p50 latency: ${Math.round(p50)}ms`);
    console.log(`p95 latency: ${Math.round(p95)}ms`);
    console.log(`Average latency: ${Math.round(avg)}ms`);
    console.log(`Min latency: ${Math.round(totalTimes[0])}ms`);
    console.log(`Max latency: ${Math.round(totalTimes[totalTimes.length - 1])}ms`);

    console.log('Simulated agent latencies:');
    console.log('  A1: 50ms, A9_pre: 35ms, A2: 70ms, A12: 25ms');

    if (allTimings.length > 0) {
      const keys = Object.keys(allTimings[0]);
      console.log('Average per-stage timing:');
      for (const key of keys) {
        const sum = allTimings.reduce((s, t) => s + (t[key] ?? 0), 0);
        console.log(`  ${key}: ${Math.round(sum / allTimings.length)}ms`);
      }
    }
    console.log('===============================');

    expect(p50).toBeLessThan(2000);
  });

  it('verifies A1 and A9-pre execution windows genuinely overlap', { timeout: 10000 }, async () => {
    const a1Windows: Array<{ start: number; end: number }> = [];
    const a9Windows: Array<{ start: number; end: number }> = [];

    vi.mocked(classifySafety).mockImplementation(async () => {
      const start = performance.now();
      await simulateLatency(50);
      const end = performance.now();
      a1Windows.push({ start, end });
      return { safetyState: 'S2', fallbackUsed: false };
    });

    vi.mocked(classifyGovernance).mockImplementation(async () => {
      const start = performance.now();
      await simulateLatency(30);
      const end = performance.now();
      a9Windows.push({ start, end });
      return { governanceState: 'Active', fallbackUsed: false };
    });

    vi.mocked(handleTurn).mockResolvedValue({ response: 'Ok.', fallbackUsed: false });
    vi.mocked(renderText).mockResolvedValue({ text: 'Ok.', fallbackUsed: false, provider: 'gemini' });

    const turnCount = 10;
    for (let i = 0; i < turnCount; i++) {
      await processTurn(UID, SESSION_ID, `test ${i}`);
    }

    expect(a1Windows.length).toBe(turnCount);
    expect(a9Windows.length).toBe(turnCount);

    let allOverlap = true;
    for (let i = 0; i < turnCount; i++) {
      const a1StartedBeforeA9Ended = a1Windows[i].start <= a9Windows[i].end;
      const a9StartedBeforeA1Ended = a9Windows[i].start <= a1Windows[i].end;
      if (!a1StartedBeforeA9Ended || !a9StartedBeforeA1Ended) {
        allOverlap = false;
        break;
      }
    }

    expect(allOverlap).toBe(true);
  });
});
