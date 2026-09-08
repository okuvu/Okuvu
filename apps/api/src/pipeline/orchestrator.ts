import type { SafetyState, GovernanceState, RouterDecision, PipelineSignal } from '@okuvu/shared-types';
import { classifySafety } from '../agents/a1/agent.js';
import { classifyGovernance } from '../agents/a9/agent.js';
import { routeTurn } from '../agents/a8-router.js';
import { handleTurn, scoreOnboardingTurn, formatUserMemory } from '../agents/a2/agent.js';
import { a9PostReview } from '../agents/a9-post/agent.js';
import { getAgentContextBundle, summariesToConversationTurns } from '../lib/agent-context.js';
import { buildToolCard } from '../lib/tool-card.js';
import { getToolResult, clearToolResult } from '../lib/tool-result-store.js';
import { prisma } from '../lib/prisma.js';
import { incrementTurnCount, isSessionClosed, getSessionCount, getSessionConversationTurns } from './session.js';
import { retrieveRelevantSessions, formatRetrievedContext } from '../lib/memory-retrieval.js';
import { getRetrievedContext, setRetrievedContext } from '../lib/retrieved-context-cache.js';
import { A2_DEGRADED_RESPONSE, getSafeFallback, A9_PRE_BLOCKED_RESPONSE } from './fallbacks.js';
import type { PipelineResult, StageTiming, TestModeOptions } from './types.js';
import type { ConversationTurn } from '../agents/a1/types.js';
import type { OnboardingInferenceOutput } from '../agents/a2/types.js';
import { decideAssignment } from '../onboarding/care-plan-assignment.js';

function injectedFaultError(faultType: 'timeout' | 'api_error'): Error {
  return new Error(faultType === 'timeout' ? 'injected_timeout' : 'injected_api_error');
}

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
  opts?: { testMode?: TestModeOptions },
): Promise<PipelineResult> {
  const timing: StageTiming[] = [];
  const pipelineStart = now();
  const testMode = opts?.testMode;
  const signals: PipelineSignal[] = [];

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

  const sessionCount = await getSessionCount(user.id);
  const sessionTurn = await prisma.sessionLog.findUnique({
    where: { id: sessionId },
    select: { turn_count: true },
  });
  const nextTurnNumber = (sessionTurn?.turn_count ?? 0) + 1;

  async function timedA1() {
    const start = now();
    try {
      if (testMode?.faults?.boundary === 'A1') throw injectedFaultError(testMode.faults.type);
      return await classifySafety({
        message,
        recentHistory: summariesToConversationTurns(contextBundle.recent_history ?? []),
      });
    } finally { recordTiming(timing, 'A1', start, now()); }
  }

  async function timedA9() {
    const start = now();
    try {
      if (testMode?.faults?.boundary === 'A9_pre') throw injectedFaultError(testMode.faults.type);
      return await classifyGovernance({
        userId: uid,
        message,
      });
    } finally { recordTiming(timing, 'A9_pre', start, now()); }
  }

  async function timedRetrieval(): Promise<string> {
    if (nextTurnNumber !== 1 || !message) return 'null';
    const cached = getRetrievedContext(sessionId);
    if (cached) return cached;
    const start = now();
    try {
      const retrieved = await retrieveRelevantSessions(uid, message, sessionId);
      const formatted = formatRetrievedContext(retrieved);
      setRetrievedContext(sessionId, formatted);
      return formatted;
    } catch (err) {
      console.error({ err }, 'Layer 3 RAG retrieval failed');
      return 'null';
    } finally {
      recordTiming(timing, 'layer3_rag', start, now());
    }
  }

  // TH-S10 test hooks: when an inject* option is set, the corresponding real
  // call is skipped entirely (not invoked at all) and a "*_skipped" timing
  // entry is recorded instead. This still flows through Promise.allSettled
  // unchanged, so the existing fallback derivation logic is untouched.
  let a1Promise: ReturnType<typeof timedA1>;
  if (testMode?.injectA1 !== undefined) {
    timing.push({ stage: 'A1_skipped', elapsedMs: 0 });
    a1Promise = Promise.resolve({ safetyState: testMode.injectA1, fallbackUsed: false });
  } else {
    a1Promise = timedA1();
  }

  let a9Promise: ReturnType<typeof timedA9>;
  if (testMode?.injectA9 !== undefined) {
    timing.push({ stage: 'A9_pre_skipped', elapsedMs: 0 });
    a9Promise = Promise.resolve({ governanceState: testMode.injectA9, fallbackUsed: false });
  } else {
    a9Promise = timedA9();
  }

  let retrievalPromise: Promise<string>;
  if (testMode?.injectRetrievedContext !== undefined) {
    timing.push({ stage: 'layer3_rag_skipped', elapsedMs: 0 });
    retrievalPromise = Promise.resolve(testMode.injectRetrievedContext);
  } else {
    retrievalPromise = timedRetrieval();
  }

  const [a1Result, a9Result, retrievalResult] = await Promise.allSettled([
    a1Promise,
    a9Promise,
    retrievalPromise,
  ]);

  const safetyState: SafetyState =
    a1Result.status === 'fulfilled' ? a1Result.value.safetyState : 'S2';

  const governanceState: GovernanceState =
    a9Result.status === 'fulfilled' ? a9Result.value.governanceState : 'Restricted';

  const retrievedContext: string =
    testMode?.injectRetrievedContext !== undefined
      ? testMode.injectRetrievedContext
      : nextTurnNumber === 1
        ? (retrievalResult.status === 'fulfilled' ? retrievalResult.value : 'null')
        : (getRetrievedContext(sessionId) ?? 'null');

  if (testMode?.captureSignalBus) {
    signals.push({ boundary: 'A1_result', agent: 'A1', payload: safetyState, timestamp: new Date().toISOString() });
    signals.push({ boundary: 'A9_pre_result', agent: 'A9-pre', payload: governanceState, timestamp: new Date().toISOString() });
  }

  let decision: RouterDecision;
  if (testMode?.injectRouter !== undefined) {
    timing.push({ stage: 'A8_router_skipped', elapsedMs: 0 });
    decision = testMode.injectRouter;
  } else {
    const a8Start = now();
    decision = routeTurn({
      safety_state: safetyState,
      governance_state: governanceState,
      session_count: sessionCount,
      turn_count: nextTurnNumber,
    });
    const a8End = now();
    recordTiming(timing, 'A8_router', a8Start, a8End);
  }

  if (testMode?.captureSignalBus) {
    signals.push({ boundary: 'A8_decision', agent: 'A8', payload: decision, timestamp: new Date().toISOString() });
  }

  if (decision.agent === 'crisis') {
    return { type: 'crisis', timing, ...(testMode?.captureSignalBus ? { signals } : {}) };
  }

  const isOnboarding = (sessionCount === 0 || contextBundle.care_plan == null) && nextTurnNumber <= 3;

  const a2Start = now();
  let finalText: string;
  let a2Fallback = false;
  let a2FailureReason: 'timeout' | 'api_error' | undefined;
  // Null whenever the persisted `content` isn't actually A2's model output —
  // either no model call completed (the outer catch block below), or
  // A9-post substituted a static getSafeFallback() string over it (cleared
  // again further down, at both places finalText is overwritten post-A2).
  let turnModelVersion: string | null = null;
  let turnPromptVersion: string | null = null;
  let a9PostBlocked = false;
  let a9PostViolation: string | null = null;
  let a9PostConfidence: string | null = null;
  let a9PostBlockedContent: string | null = null;
  // Set when A8 routed this turn to A2 mode='blocked' — A9-pre (governance)
  // rejected the message, but A1 did not find crisis-level risk. Skips the
  // real A2 call and A9-post review entirely (there is no real model output
  // to review), same shape as the existing A9-post-blocked path below but
  // triggered pre-emptively instead of post-hoc.
  let a9PreBlocked = false;
  let estimatedIntensity: number | null = null;
  let crisisFlag = false;
  let carePlanReviewFlag = false;
  let onboardingInference: OnboardingInferenceOutput | undefined;
  let toolCard: import('@okuvu/shared-types').ToolCardConfig | undefined;

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

  const userMemoryContext = formatUserMemory(contextBundle.user_memory);

  if (decision.mode === 'blocked') {
    // A9-pre (governance) rejected this message and A1 did not find
    // crisis-level risk — no real A2 call, no A9-post review (there is
    // nothing of A2's to review). A static, non-alarming reply, always.
    finalText = A9_PRE_BLOCKED_RESPONSE;
    a9PreBlocked = true;
  } else {
    try {
      if (testMode?.faults?.boundary === 'A2') throw injectedFaultError(testMode.faults.type);

      const a2ResultRaw = await handleTurn({
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
        userMemoryContext,
        retrievedContext,
      });

      // TH-S10: signalOverride only supports boundary 'a2_result' — a shallow
      // merge onto the object returned by handleTurn, applied before any field
      // (userContent/fallbackUsed/signal) is read from it.
      const a2Result = testMode?.signalOverride?.boundary === 'a2_result'
        ? ({ ...a2ResultRaw, ...(testMode.signalOverride.payload as Record<string, unknown>) } as typeof a2ResultRaw)
        : a2ResultRaw;

      finalText = a2Result.userContent;
      a2Fallback = a2Result.fallbackUsed;
      a2FailureReason = a2Result.failureReason;
      // Canned/test-hook text was never actually produced by a2Result's
      // resolved model/prompt — those fields report what would have been
      // used, not what was, so attribution stays null rather than persisting
      // a fictitious provenance record for canned content.
      turnModelVersion = a2Result.canned ? null : a2Result.modelVersion;
      turnPromptVersion = a2Result.canned ? null : a2Result.promptVersion;

      if (testMode?.captureSignalBus) {
        signals.push({ boundary: 'A2_result', agent: 'A2', payload: a2Result, timestamp: new Date().toISOString() });
      }

      if (a2Result.signal) {
        estimatedIntensity = a2Result.signal.estimated_intensity;
        crisisFlag = a2Result.signal.session_flags.crisis_language_detected;
        carePlanReviewFlag = a2Result.signal.care_plan_fit === 'possible_mismatch';
      }

      toolCard = a2Result.signal?.tool_launch_recommended
        ? buildToolCard(a2Result.signal.tool_launch_recommended, a2Result.signal.breathing_config)
        : undefined;

      // Skip when A2's real call already fell back: scoring finalText here
      // would score the canned/degraded fallback text as if it were a real
      // reply (misleading signal), and — since scoreOnboardingTurn makes its
      // own real, separately-timed-out LLM call — stacks a second up-to-30s
      // wait sequentially inside this same stage on top of A2's already-
      // timed-out call. Confirmed live (2026-09-07): a single real A2
      // timeout produced a 42.2s 'A2_response' stage against a 30s
      // configured timeout — not a bug in the timeout mechanism itself
      // (which fired correctly at ~30s), but this uninstrumented second
      // call running immediately after it.
      if (isOnboarding && !a2Fallback) {
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
      a2FailureReason = testMode?.faults?.boundary === 'A2' ? testMode.faults.type : 'api_error';
    }
  }
  const a2End = now();
  recordTiming(timing, 'A2_response', a2Start, a2End);

  if (!a2Fallback && !a9PreBlocked) {
    const a9PostStart = now();
    try {
      if (testMode?.faults?.boundary === 'A9_post') throw injectedFaultError(testMode.faults.type);

      const a9PostResult = await a9PostReview({
        userContent: finalText,
        safetyState,
        carePlan: contextBundle.care_plan?.care_plan_id ?? 'CP1',
      });

      a9PostConfidence = a9PostResult.confidence;

      if (a9PostResult.decision === 'BLOCKED') {
        a9PostBlockedContent = finalText;
        finalText = getSafeFallback(safetyState);
        a9PostBlocked = true;
        a9PostViolation = a9PostResult.violation_type;
        // finalText is now a static getSafeFallback() string, not A2's model
        // output — the model/prompt attribution no longer applies to it.
        turnModelVersion = null;
        turnPromptVersion = null;
      }

      if (testMode?.captureSignalBus) {
        signals.push({ boundary: 'A9_post_result', agent: 'A9-post', payload: a9PostResult, timestamp: new Date().toISOString() });
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.info({ err: errMsg }, 'A9-post: call failed, applying failover strategy');

      if (safetyState === 'S2') {
        finalText = getSafeFallback(safetyState);
        a9PostBlocked = true;
        a9PostViolation = 'a9_post_unavailable_s2';
        a9PostConfidence = 'low';
        turnModelVersion = null;
        turnPromptVersion = null;
      }

      // Same signal shape as the success-path push above (line ~300), just
      // reflecting what actually happened when the call itself failed. Without
      // this, a caller reading the signal bus (e.g. the test harness's
      // Simulator) has no way to tell that A9-post ran at all on this turn —
      // the reply silently changes (S2 case) or goes out unreviewed
      // (non-S2 case) with no trace of why.
      if (testMode?.captureSignalBus) {
        signals.push({
          boundary: 'A9_post_result',
          agent: 'A9-post',
          payload: {
            decision: a9PostBlocked ? 'BLOCKED' : 'APPROVED',
            violation_type: a9PostViolation,
            confidence: a9PostConfidence ?? 'low',
            call_failed: true,
          },
          timestamp: new Date().toISOString(),
        });
      }
    }
    recordTiming(timing, 'A9_post', a9PostStart, now());
  }

  const newTurnCount = await incrementTurnCount(sessionId);

  const [userTurn, assistantTurn] = await prisma.$transaction([
    prisma.turn.create({
      data: {
        session_id: sessionId, user_id: user.id, turn_number: newTurnCount,
        role: 'user', content: message,
      },
    }),
    prisma.turn.create({
      data: {
        session_id: sessionId, user_id: user.id, turn_number: newTurnCount,
        role: 'assistant', content: finalText,
        is_a9_fallback: a9PostBlocked || a9PreBlocked,
        model_version: turnModelVersion,
        prompt_version: turnPromptVersion,
      },
      select: { id: true },
    }),
  ]);

  if (a9PreBlocked) {
    await prisma.governanceLog.create({
      data: {
        session_id: sessionId,
        turn_number: newTurnCount,
        gate: 'A9-PRE',
        decision: 'Blocked',
        // A9-pre's output today is only a bare governanceState (no
        // reason/violation_type) — 'unavailable' documents that gap rather
        // than inventing a fake reason. confidence is required by the
        // schema but A9-pre has no concept of one; 'n/a' is honest about
        // that, not a placeholder pretending to be real data.
        violation_type: 'unavailable',
        confidence: 'n/a',
        blocked_content: null,
      },
    });
  }

  if (a9PostBlocked) {
    await prisma.governanceLog.create({
      data: {
        session_id: sessionId,
        turn_number: newTurnCount,
        gate: 'A9-POST',
        decision: 'BLOCKED',
        violation_type: a9PostViolation,
        confidence: a9PostConfidence ?? 'low',
        blocked_content: a9PostBlockedContent,
      },
    });
  }

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
    failureReason: a2FailureReason,
    estimatedIntensity,
    toolCard,
    onboardingInference,
    ...(testMode?.captureSignalBus ? { signals } : {}),
  };
}
