import type { SafetyState, GovernanceState, RouterDecision } from '@evia/shared-types';
import { classifySafety } from '../agents/a1/agent.js';
import { classifyGovernance } from '../agents/a9/agent.js';
import { routeTurn } from '../agents/a8-router.js';
import { handleTurn, scoreOnboardingTurn } from '../agents/a2/agent.js';
import { getAgentContextBundle, summariesToConversationTurns } from '../lib/agent-context.js';
import { buildToolCard } from '../lib/tool-card.js';
import { getToolResult, clearToolResult } from '../lib/tool-result-store.js';
import { prisma } from '../lib/prisma.js';
import { incrementTurnCount, isSessionClosed, getSessionCount, getSessionConversationTurns } from './session.js';
import { A2_DEGRADED_RESPONSE } from './fallbacks.js';
import type { PipelineResult, StageTiming } from './types.js';
import type { ConversationTurn } from '../agents/a1/types.js';
import type { OnboardingInferenceOutput } from '../agents/a2/types.js';
import { decideAssignment } from '../onboarding/care-plan-assignment.js';

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
      recentHistory: summariesToConversationTurns(contextBundle.recent_history ?? []),
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

  const isOnboarding = (sessionCount === 0 || contextBundle.care_plan == null) && nextTurnNumber <= 3;

  const a2Start = now();
  let finalText: string;
  let a2Fallback = false;
  let estimatedIntensity: number | null = null;
  let crisisFlag = false;
  let carePlanReviewFlag = false;
  let onboardingInference: OnboardingInferenceOutput | undefined;
  let toolCard: import('@evia/shared-types').ToolCardConfig | undefined;

  let toolResultContext: string | undefined;
  const pendingToolResult = getToolResult(sessionId);
  if (pendingToolResult?.tool_type === 'grounding_5431') {
    const r = pendingToolResult.result;
    toolResultContext = [
      'TOOL RESULT — The user just completed the 5-4-3-2-1 grounding exercise.',
      'What they named:',
      `See: ${r.see.join(', ')}`,
      `Touch: ${r.touch.join(', ')}`,
      `Hear: ${r.hear.join(', ')}`,
      `Smell: ${r.smell.join(', ')}`,
      `Taste: ${r.taste.join(', ')}`,
      'Reference what they named naturally in your response. Do not list them back mechanically.',
    ].join('\n');
    clearToolResult(sessionId);
  }

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
      recentHistory: summariesToConversationTurns(contextBundle.recent_history ?? []),
      toolResultContext,
    });
    finalText = a2Result.userContent;
    a2Fallback = a2Result.fallbackUsed;

    if (a2Result.signal) {
      estimatedIntensity = a2Result.signal.estimated_intensity;
      crisisFlag = a2Result.signal.session_flags.crisis_language_detected;
      carePlanReviewFlag = a2Result.signal.care_plan_fit === 'possible_mismatch';
    }

    toolCard = a2Result.signal?.tool_launch_recommended
      ? buildToolCard(a2Result.signal.tool_launch_recommended, a2Result.signal.breathing_config)
      : undefined;

    if (isOnboarding) {
      const existingTurns = await getSessionConversationTurns(sessionId);
      const allTurns: ConversationTurn[] = [
        ...existingTurns,
        { role: 'user' as const, content: message },
        { role: 'assistant' as const, content: finalText },
      ];
      onboardingInference = await scoreOnboardingTurn(allTurns);
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
    skipDuplicates: true,
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

  if (isOnboarding && onboardingInference && nextTurnNumber === 3) {
    const assignment = decideAssignment([onboardingInference]);
    await prisma.clinicalConfig.upsert({
      where: { user_id: user.id },
      create: {
        user_id: user.id,
        care_plan_id: assignment.care_plan_id,
        assignment_state: assignment.assignment_state,
        confidence_at_last_eval: assignment.confidence_at_last_eval,
        turns_evaluated: assignment.turns_evaluated,
        reasoning_note: assignment.reasoning_note,
      },
      update: {
        care_plan_id: assignment.care_plan_id,
        assignment_state: assignment.assignment_state,
        confidence_at_last_eval: assignment.confidence_at_last_eval,
        turns_evaluated: assignment.turns_evaluated,
        reasoning_note: assignment.reasoning_note,
      },
    });
    console.log({
      event: 'onboarding_assignment',
      user_id: user.id,
      session_id: sessionId,
      care_plan_id: assignment.care_plan_id,
      assignment_state: assignment.assignment_state,
      turns_evaluated: assignment.turns_evaluated,
    }, 'Onboarding care plan assigned');
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
    toolCard,
    onboardingInference,
  };
}
