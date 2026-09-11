/**
 * Crisis-record completeness (mvp-v2-engineering-spec.md §5.2, "audit fix
 * 1.3"). This check existed to make a real gap visible, not to paper over
 * it: for a long time, `processTurn`'s crisis branch
 * (apps/api/src/pipeline/orchestrator.ts) returned before any of the Turn
 * insert / SafetyState upsert / crisis_flag_detected update ran, and the one
 * production consumer (apps/api/src/routes/websocket.ts) only sent a
 * CRISIS_SIGNAL frame and logged one line — no database row was written for
 * a crisis-routed turn at all. That gap is now fixed (see orchestrator.ts's
 * crisis branch and its "crisis turn persistence" test suite) — a genuine
 * S4 turn persists the user's message, upserts SafetyState to S4, and sets
 * crisis_flag_detected when A1 reported it. This check remains live so a
 * future regression against any of those three records is still caught.
 */

interface CrisisRecordPrisma {
  turn: { count: (args: { where: { session_id: string } }) => Promise<number> };
  safetyState: {
    findUnique: (args: {
      where: { user_id: string };
    }) => Promise<{ safety_state_current: string } | null>;
  };
  sessionLog: {
    findUnique: (args: {
      where: { id: string };
    }) => Promise<{ crisis_flag_detected: boolean } | null>;
  };
}

export interface CrisisRecordCompleteness {
  /** At least one Turn row exists for this session (the user's message, at minimum). */
  turnPersisted: boolean;
  /** The user's SafetyState.safety_state_current reflects the crisis-triggering state. */
  safetyStateUpdated: boolean;
  /** SessionLog.crisis_flag_detected was set for this session. */
  crisisFlagSet: boolean;
  complete: boolean;
}

export async function checkCrisisRecordCompleteness(params: {
  prisma: CrisisRecordPrisma;
  sessionId: string;
  userId: string;
  expectedSafetyState?: string;
}): Promise<CrisisRecordCompleteness> {
  const { prisma, sessionId, userId, expectedSafetyState = 'S4' } = params;

  const [turnCount, safetyStateRow, sessionLog] = await Promise.all([
    prisma.turn.count({ where: { session_id: sessionId } }),
    prisma.safetyState.findUnique({ where: { user_id: userId } }),
    prisma.sessionLog.findUnique({ where: { id: sessionId } }),
  ]);

  const turnPersisted = turnCount > 0;
  const safetyStateUpdated = safetyStateRow?.safety_state_current === expectedSafetyState;
  const crisisFlagSet = sessionLog?.crisis_flag_detected === true;

  return {
    turnPersisted,
    safetyStateUpdated,
    crisisFlagSet,
    complete: turnPersisted && safetyStateUpdated && crisisFlagSet,
  };
}
