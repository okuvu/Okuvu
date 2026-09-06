import { describe, it, expect, vi } from 'vitest';
import { checkCrisisRecordCompleteness } from '../lib/crisis-record';

function makePrisma(overrides: {
  turnCount?: number;
  safetyState?: { safety_state_current: string } | null;
  sessionLog?: { crisis_flag_detected: boolean } | null;
}) {
  return {
    turn: { count: vi.fn().mockResolvedValue(overrides.turnCount ?? 0) },
    safetyState: { findUnique: vi.fn().mockResolvedValue(overrides.safetyState ?? null) },
    sessionLog: { findUnique: vi.fn().mockResolvedValue(overrides.sessionLog ?? null) },
  };
}

describe('checkCrisisRecordCompleteness', () => {
  it('reports complete:false against the real (unfixed) current behavior — nothing persisted', async () => {
    const prisma = makePrisma({});

    const result = await checkCrisisRecordCompleteness({
      prisma,
      sessionId: 'session-1',
      userId: 'user-1',
    });

    expect(result).toEqual({
      turnPersisted: false,
      safetyStateUpdated: false,
      crisisFlagSet: false,
      complete: false,
    });
  });

  it('reports complete:true when all three records are present and consistent', async () => {
    const prisma = makePrisma({
      turnCount: 1,
      safetyState: { safety_state_current: 'S4' },
      sessionLog: { crisis_flag_detected: true },
    });

    const result = await checkCrisisRecordCompleteness({
      prisma,
      sessionId: 'session-1',
      userId: 'user-1',
    });

    expect(result).toEqual({
      turnPersisted: true,
      safetyStateUpdated: true,
      crisisFlagSet: true,
      complete: true,
    });
  });

  it('reports complete:false when only some records are present', async () => {
    const prisma = makePrisma({ turnCount: 1, safetyState: null, sessionLog: { crisis_flag_detected: false } });

    const result = await checkCrisisRecordCompleteness({
      prisma,
      sessionId: 'session-1',
      userId: 'user-1',
    });

    expect(result.turnPersisted).toBe(true);
    expect(result.safetyStateUpdated).toBe(false);
    expect(result.crisisFlagSet).toBe(false);
    expect(result.complete).toBe(false);
  });

  it('checks safety_state_current against the expected value (defaults to S4)', async () => {
    const prisma = makePrisma({
      turnCount: 1,
      safetyState: { safety_state_current: 'S2' },
      sessionLog: { crisis_flag_detected: true },
    });

    const result = await checkCrisisRecordCompleteness({
      prisma,
      sessionId: 'session-1',
      userId: 'user-1',
    });

    expect(result.safetyStateUpdated).toBe(false);
    expect(result.complete).toBe(false);
  });
});
