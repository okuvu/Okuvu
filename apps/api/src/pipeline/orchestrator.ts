import type { SafetyState, GovernanceState, RouterDecision } from '@evia/shared-types';
import { classifySafety } from '../agents/a1/agent.js';
import { classifyGovernance } from '../agents/a9/agent.js';
import { routeTurn } from '../agents/a8-router.js';
import { handleTurn } from '../agents/a2/agent.js';
import { getAgentContextBundle } from '../lib/agent-context.js';
import { prisma } from '../lib/prisma.js';
import { incrementTurnCount, isSessionClosed, getSessionCount } from './session.js';
import { A2_DEGRADED_RESPONSE } from './fallbacks.js';
import type { PipelineResult, StageTiming } from './types.js';
import type { ConversationTurn } from '../agents/a1/types.js';

function now(): number {
  return performance.now();
}

function recordTiming(timing: StageTiming[], stage: string, startMs: number, endMs: number): void {
  const elapsedMs = Math.round(endMs - startMs);
  timing.push({ stage, elapsedMs });
  console.log({ perf: stage, elapsedMs });
}

export async function processTurn(
  uid: string,
  sessionId: string,
  message: string,
  perceivedIntensity: number | null = null,
): Promise<PipelineResult> {
  const timing: StageTiming[] = [];
  const pipelineStart = now();

  const closed = await isSessionClosed(sessionId);
  if (closed) {
    recordTiming(timing, 'validation', pipelineStart, now());
    return { type: 'error', errorCode: 'SESSION_CLOSED', timing };
  }

  const user = await prisma.user.findUnique({
    where: { firebase_uid: uid },
    select: { id: true },
  });
  if (!user) {
    recordTiming(timing, 'validation', pipelineStart, now());
    return { type: 'error', errorCode: 'USER_NOT_FOUND', timing };
  }

  const contextBundle = await getAgentContextBundle(uid);

  async function timedA1() {
    const start = now();
    try { return await classifySafety({
      message,
      recentHistory: (contextBundle.recent_history ?? []) as unknown as ConversationTurn[],
    }); } finally { recordTiming(timing, 'A1', start, now()); }
  }

  async function timedA9() {
    const start = now();
    try { return await classifyGovernance({
      userId: uid,
      message,
    }); } finally { recordTiming(timing, 'A9_pre', start, now()); }
  }

  const [a1Result, a9Result] = await Promise.allSettled([timedA1(), timedA9()]);

  const safetyState: SafetyState =
    a1Result.status === 'fulfilled' ? a1Result.value.safetyState : 'S2';

  const governanceState: GovernanceState =
    a9Result.status === 'fulfilled' ? a9Result.value.governanceState : 'Restricted';

  const a8Start = now();

  const sessionCount = await getSessionCount(user.id);
  const session = await prisma.sessionLog.findUnique({
    where: { id: sessionId },
    select: { turn_count: true },
  });
  const nextTurnNumber = (session?.turn_count ?? 0) + 1;

  const decision: RouterDecision = routeTurn({
    safety_state: safetyState,
    governance_state: governanceState,
    session_count: sessionCount,
    turn_count: nextTurnNumber,
  });
  const a8End = now();
  recordTiming(timing, 'A8_router', a8Start, a8End);

  if (decision.agent === 'crisis') {
    return { type: 'crisis', timing };
  }

  const a2Start = now();
  let finalText: string;
  let a2Fallback = false;
  let estimatedIntensity: number | null = null;
  let crisisFlag = false;
  let carePlanReviewFlag = false;

  try {
    const a2Result = await handleTurn({
      userId: uid,
      message,
      carePlan: (contextBundle.care_plan?.care_plan_id ?? 'CP1') as 'CP1' | 'CP2' | 'CP3',
      safetyState: safetyState as 'S0' | 'S1' | 'S2',
      sessionNumber: sessionCount + 1,
      turnNumber: nextTurnNumber,
      sessionHistorySummary: contextBundle.session_summary,
      perceivedIntensity,
      mode: decision.mode ?? 'normal',
      recentHistory: (contextBundle.recent_history ?? []) as unknown as ConversationTurn[],
    });
    finalText = a2Result.userContent;
    a2Fallback = a2Result.fallbackUsed;

    if (a2Result.signal) {
      estimatedIntensity = a2Result.signal.estimated_intensity;
      crisisFlag = a2Result.signal.session_flags.crisis_language_detected;
      carePlanReviewFlag = a2Result.signal.care_plan_fit === 'possible_mismatch';
    }
  } catch {
    finalText = A2_DEGRADED_RESPONSE;
    a2Fallback = true;
  }
  const a2End = now();
  recordTiming(timing, 'A2_response', a2Start, a2End);

  const newTurnCount = await incrementTurnCount(sessionId);

  await prisma.turn.createMany({
    data: [
      { session_id: sessionId, user_id: user.id, turn_number: newTurnCount, role: 'user', content: message },
      { session_id: sessionId, user_id: user.id, turn_number: newTurnCount, role: 'assistant', content: finalText },
    ],
  });

  const assistantTurn = await prisma.turn.findFirst({
    where: {
      session_id: sessionId,
      role: 'assistant',
      turn_number: newTurnCount,
    },
    orderBy: [{ created_at: 'asc' }],
    select: { id: true },
  });

  await prisma.safetyState.upsert({
    where: { user_id: user.id },
    update: { safety_state_current: safetyState },
    create: { user_id: user.id, safety_state_current: safetyState },
  });

  if (crisisFlag) {
    await prisma.sessionLog.update({
      where: { id: sessionId },
      data: { crisis_flag_detected: true },
    });
  }

  if (carePlanReviewFlag && contextBundle.care_plan?.id) {
    await prisma.clinicalConfig.update({
      where: { id: contextBundle.care_plan.id },
      data: { care_plan_review_flagged: true },
    });
  }

  console.log({
    perf: 'total_turn',
    elapsedMs: Math.round(now() - pipelineStart),
    stages: timing,
  });

  return {
    type: 'agent_turn',
    message: finalText,
    turnCount: newTurnCount,
    turnId: assistantTurn?.id ?? null,
    timing,
    fallbackUsed: a2Fallback,
    estimatedIntensity,
  };
}
