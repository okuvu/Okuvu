import type { SafetyState, GovernanceState, RouterDecision, PipelineSignal, ToolCardType } from '@okuvu/shared-types';
import { classifySafety } from '../agents/a1/agent.js';
import { classifyGovernance } from '../agents/a9/agent.js';
import { routeTurn } from '../agents/a8-router.js';
import { handleTurn, formatUserMemory } from '../agents/a2/agent.js';
import { a9PostReview } from '../agents/a9-post/agent.js';
import { getAgentContextBundle, summariesToConversationTurns } from '../lib/agent-context.js';
import { buildToolCard } from '../lib/tool-card.js';
import { getToolResult, clearToolResult } from '../lib/tool-result-store.js';
import { prisma } from '../lib/prisma.js';
import { incrementTurnCount, isSessionClosed, getSessionCount, getSessionConversationTurns } from './session.js';
import { retrieveRelevantSessions, formatRetrievedContext } from '../lib/memory-retrieval.js';
import { getRetrievedContext, setRetrievedContext } from '../lib/retrieved-context-cache.js';
import { A2_DEGRADED_RESPONSE, getSafeFallback, A9_PRE_BLOCKED_RESPONSE, A8_S3_GROUNDING_RESPONSE, CRISIS_RESPONSE } from './fallbacks.js';
import type { PipelineResult, StageTiming, TestModeOptions, FallbackSource } from './types.js';

function injectedFaultError(faultType: 'timeout' | 'api_error'): Error {
  return new Error(faultType === 'timeout' ? 'injected_timeout' : 'injected_api_error');
}

const KNOWN_TOOL_CARD_TYPES: ReadonlySet<string> = new Set(['guided_breathing', 'box_breathing', 'grounding_5431', 'physiological_sigh', 'extended_exhale']);

function isKnownToolCardType(value: string): value is ToolCardType {
  return KNOWN_TOOL_CARD_TYPES.has(value);
}

function now(): number {
  return performance.now();
}

function recordTiming(timing: StageTiming[], stage: string, startMs: number, endMs: number): void {
  const elapsedMs = Math.round(endMs - startMs);
  timing.push({ stage, elapsedMs });
  console.log({ perf: stage, elapsedMs });
}

// okuvu-remaining-changes.md §E — A1's own prompt has asked for
// gap_before_ms/repetition_count as "when available" metadata since it was
// written, but nothing computed them until now (same "prompt asks for it,
// nothing produces it" gap taper_state had before §B.2). Deliberately not
// attempting register_shift here — a real style-shift heuristic needs its
// own design pass, not a mechanical computation like these two.

/** Null on a session's first turn — there is no previous user turn to diff against. */
function computeGapBeforeMs(turns: Array<{ role: string; created_at: Date }>): number | null {
  const lastUserTurn = [...turns].reverse().find((t) => t.role === 'user');
  return lastUserTurn ? Date.now() - lastUserTurn.created_at.getTime() : null;
}

/** How many of the user's last `window` messages in this session exactly match the current one (normalized, case-insensitive) — deliberately simple, not a similarity/fuzzy-match heuristic. */
function computeRepetitionCount(turns: Array<{ role: string; content: string }>, message: string, window = 5): number {
  const normalized = message.trim().toLowerCase();
  const recentUserMessages = turns.filter((t) => t.role === 'user').slice(-window);
  return recentUserMessages.filter((t) => t.content.trim().toLowerCase() === normalized).length;
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

  // A2 fix (OKUVU — Plumbing Fixes & Rationale v1.0): fetch the CURRENT
  // session's own turns ONCE, up front. Previously these were fetched only
  // inside timedA1 (for gap_before_ms/repetition_count) and discarded — A2
  // never saw them. Combined with the dead summary worker (A1 fix), that
  // meant A2 had zero continuity: past-session summaries were empty AND the
  // current session's turns were dropped, so "okay" read as a fresh session
  // and the agent re-onboarded. Continuity is structurally impossible
  // without this wiring, no matter how good the model is.
  //
  // Safe to call before any Turn rows for THIS turn exist — the user/assistant
  // rows for the current message are written in the $transaction at the end
  // of processTurn, so this list never contains the message we're about to
  // send (handleTurn appends it itself). Also reused for A1's timing metrics
  // below instead of a second identical DB round-trip.
  const currentSessionTurns = await getSessionConversationTurns(sessionId);

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
        gap_before_ms: computeGapBeforeMs(currentSessionTurns),
        repetition_count: computeRepetitionCount(currentSessionTurns, message),
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
    a1Promise = Promise.resolve({
      safetyState: testMode.injectA1,
      fallbackUsed: false,
      crisis_language_detected: false,
      basis: 'literal',
      signal_strength: 'medium',
      notes: null,
    });
  } else {
    a1Promise = timedA1();
  }

  let a9Promise: ReturnType<typeof timedA9>;
  if (testMode?.injectA9 !== undefined) {
    timing.push({ stage: 'A9_pre_skipped', elapsedMs: 0 });
    a9Promise = Promise.resolve({
      governanceState: testMode.injectA9,
      fallbackUsed: false,
      reasonCode: null,
      confidence: 'medium',
      notes: null,
    });
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

  // OKUVU v2.0: A1 is now the authoritative source for crisis_language_detected
  // (it classifies every message, not just ones A2 responds to, and runs
  // before A2 ever sees the turn) — previously sourced from A2's S-06 signal,
  // which only existed on turns that actually reached a real A2 call. Computed
  // here (rather than after the crisis branch below) because the crisis path
  // needs it too.
  const crisisFlag: boolean =
    a1Result.status === 'fulfilled' ? a1Result.value.crisis_language_detected : false;

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
    // Audit 1.3 / OKUVU v2.0: a genuine S4 crisis must still leave a real,
    // reviewable record. As of the crisis-content fix, it also gets a real,
    // persisted, deterministic assistant reply — same tier of determinism as
    // the S3/blocked paths above (no real A2 call, no A9-post review; a
    // static, approved-content reply, always). See CRISIS_RESPONSE in
    // fallbacks.ts for the content and its provenance.
    const persistStart = now();
    const crisisTurnCount = await incrementTurnCount(sessionId);
    await prisma.turn.create({
      data: {
        session_id: sessionId, user_id: user.id, turn_number: crisisTurnCount,
        role: 'user', content: message,
      },
    });
    await prisma.turn.create({
      data: {
        session_id: sessionId, user_id: user.id, turn_number: crisisTurnCount,
        role: 'assistant', content: CRISIS_RESPONSE,
      },
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
    recordTiming(timing, 'crisis_persistence', persistStart, now());

    return { type: 'crisis', message: CRISIS_RESPONSE, timing, ...(testMode?.captureSignalBus ? { signals } : {}) };
  }

  const a2Start = now();
  let finalText: string;
  let a2Fallback = false;
  // A4 (OKUVU — Plumbing Fixes & Rationale v1.0): the reply the user actually
  // saw must be attributable. Every path below that serves a static substitute
  // sets BOTH a2Fallback:true (so the scorecard's zero-tolerance fallback gate
  // sees it — previously only the A2-degraded path did, which is exactly how
  // blocked turns got recorded as fallbackUsed:false) AND fallbackSource (so
  // the substitute persists as its own governed artifact on the Turn row).
  let fallbackSource: FallbackSource | null = null;
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
  // OKUVU v2.0: set when A8 routed this turn to agent='deterministic-grounding'
  // — A1 classified S3 (elevated risk). Same shape as a9PreBlocked: a real,
  // persisted turn with static content, no real A2 call, no A9-post review.
  let a8GroundingDeterministic = false;
  let estimatedIntensity: number | null = null;
  // okuvu-remaining-changes.md §B.2/§C.2: persisted onto the assistant Turn
  // below so A2's own per-turn S-07 judgments aren't silently discarded —
  // no consumer (auto-close, report card, therapist notifications) reads
  // these yet, see Turn's schema comment.
  let taperState = 'none';
  let closureOffered = false;
  let frustrationEvent = false;
  let homeworkReferenced = false;
  let therapistReferral = false;
  // okuvu-remaining-changes.md §C.4: chat→journal handoff. Transient only —
  // forwarded to the client below, never persisted onto Turn (unlike the
  // other S-07 fields above), since it's user-facing suggested content, not
  // a state flag.
  let journalPromptSuggested: string | null = null;
  // OKUVU v2.0: care_plan_fit is dropped from A2's signal (S-07) — the audit's
  // recommended owner is Worker 05 (session-summary), not yet built. No
  // replacement source exists yet, so care_plan_review_flagged is not set
  // anywhere in this phase.
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

  // OKUVU v2.0: sourced from getAgentContextBundle's real DB reads (User.
  // language_mode, ClinicalConfig.care_plan_focus — see agent-context.ts),
  // with testMode injection for harness runs that don't want to seed DB
  // rows. Declared once and passed to BOTH A2 and A9-post so the two never
  // drift apart — A9-post must always review under the same language_mode/
  // care_plan_focus assumption A2 was given.
  const languageMode: 'english' | 'mirror' = testMode?.injectLanguageMode ?? contextBundle.language_mode;
  const carePlanFocus: string | null = testMode?.injectCarePlanFocus ?? contextBundle.care_plan_focus;
  const therapistName: string | null = testMode?.injectTherapistName ?? contextBundle.therapist_name;
  const homework: string | null = testMode?.injectHomework ?? contextBundle.homework;
  // No real data source yet for "tools this therapist selected for this
  // client" (that's portal UI, out of scope) — production always sees [],
  // degrading to the prompt's own "always-available tools" default. Harness
  // runs can override via injectToolkit to exercise A2 with a real toolkit.
  const toolkit: string[] = testMode?.injectToolkit ?? [];

  if (decision.agent === 'deterministic-grounding') {
    // A1 classified S3 (elevated risk) — no real A2 call, no A9-post review
    // (there is nothing of A2's to review). A static, grounding-oriented
    // reply, always. (A4: counts as a substitute — the user did not receive
    // model output this turn.)
    finalText = A8_S3_GROUNDING_RESPONSE;
    a8GroundingDeterministic = true;
    a2Fallback = true;
    fallbackSource = 'deterministic_grounding';
  } else if (decision.mode === 'blocked') {
    // A9-pre (governance) rejected this message and A1 did not find
    // crisis-level risk — no real A2 call, no A9-post review (there is
    // nothing of A2's to review). A static, governed block-response, always.
    // (A4: the canonical "telemetry lies on blocks" path — this used to
    // record fallbackUsed:false while the user saw a canned line.)
    finalText = A9_PRE_BLOCKED_RESPONSE;
    a9PreBlocked = true;
    a2Fallback = true;
    fallbackSource = 'a9_pre_blocked';
  } else {
    try {
      if (testMode?.faults?.boundary === 'A2') throw injectedFaultError(testMode.faults.type);

      const a2ResultRaw = await handleTurn({
        userId: uid,
        message,
        carePlan: (contextBundle.care_plan?.care_plan_id ?? 'CP1') as 'CP1' | 'CP2' | 'CP3',
        safetyState: safetyState as 'S0' | 'S1' | 'S2',
        sessionHistorySummary: contextBundle.session_summary,
        perceivedIntensity,
        // A2 fix (see the currentSessionTurns comment near the top): the
        // current session's own turns now actually reach A2 as conversation
        // history. These are the raw user/assistant turns of THIS session,
        // ordered oldest-first; handleTurn appends the current message
        // itself. summariesToConversationTurns (past-session summary
        // digests) are still passed alongside via recentHistory below —
        // the two layers are complementary, not redundant.
        recentHistory: [
          ...summariesToConversationTurns(contextBundle.recent_history ?? []),
          ...currentSessionTurns.map((t) => ({ role: t.role, content: t.content })),
        ],
        toolResultContext,
        userMemoryContext,
        retrievedContext,
        // OKUVU v2.0 additions.
        therapistName,
        carePlanFocus,
        homework,
        toolkit,
        languageMode,
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
        estimatedIntensity = a2Result.signal.intensity;
        taperState = a2Result.signal.taper_state;
        closureOffered = a2Result.signal.closure_offered;
        frustrationEvent = a2Result.signal.frustration_event;
        homeworkReferenced = a2Result.signal.homework_referenced;
        therapistReferral = a2Result.signal.therapist_referral;
        journalPromptSuggested = a2Result.signal.journal_prompt_suggested ?? null;
      }

      // OKUVU v2.0: tool_launched is now a free-form tool-id string (the
      // T1-T8 codes and fixed breathing_config shape are retired — a real
      // tool-id registry is a separate, not-yet-built workstream). Only
      // build a tool card when it happens to match one of the app's
      // currently-known card types; anything else is a valid tool-id with
      // no app-side card yet, not an error.
      const toolLaunched = a2Result.signal?.tool_launched;
      toolCard = toolLaunched && isKnownToolCardType(toolLaunched)
        ? buildToolCard(toolLaunched)
        : undefined;

    } catch {
      finalText = A2_DEGRADED_RESPONSE;
      a2Fallback = true;
      fallbackSource = 'a2_degraded';
      a2FailureReason = testMode?.faults?.boundary === 'A2' ? testMode.faults.type : 'api_error';
    }
  }
  const a2End = now();
  recordTiming(timing, 'A2_response', a2Start, a2End);

  if (!a2Fallback && !a9PreBlocked && !a8GroundingDeterministic) {
    const a9PostStart = now();
    try {
      if (testMode?.faults?.boundary === 'A9_post') throw injectedFaultError(testMode.faults.type);

      const a9PostResult = await a9PostReview({
        draftResponse: finalText,
        safetyState,
        carePlan: contextBundle.care_plan?.care_plan_id ?? 'CP1',
        // OKUVU v2.0: must match what A2 was actually given (see the shared
        // languageMode/carePlanFocus declaration above) — a review under the
        // wrong language_mode assumption would misjudge a Hinglish reply.
        languageMode,
        carePlanFocus,
      });

      a9PostConfidence = a9PostResult.confidence;

      if (a9PostResult.decision === 'BLOCKED') {
        a9PostBlockedContent = finalText;
        finalText = getSafeFallback(safetyState);
        a9PostBlocked = true;
        a9PostViolation = a9PostResult.violation_type;
        // A4: the user is now looking at a governed substitute, not A2's
        // model output — record it as the fallback it is, never as a clean
        // pass.
        a2Fallback = true;
        fallbackSource = 'a9_post_blocked';
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
        a2Fallback = true;
        fallbackSource = 'a9_post_unavailable';
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
        fallback_source: fallbackSource,
        model_version: turnModelVersion,
        prompt_version: turnPromptVersion,
        taper_state: taperState,
        closure_offered: closureOffered,
        frustration_event: frustrationEvent,
        homework_referenced: homeworkReferenced,
        therapist_referral: therapistReferral,
      },
      select: { id: true },
    }),
  ]);

  if (a9PreBlocked) {
    // OKUVU v2.0: A9-pre's output now carries a real reasonCode/confidence
    // (agents/a9/types.ts) — a Blocked verdict only ever comes from a real,
    // successful classification (a failed/fallback call defaults to
    // Restricted, never Blocked), so a9Result is reliably fulfilled here.
    // 'unavailable'/'low' are defensive fallbacks, not the expected path.
    const a9PreReasonCode = a9Result.status === 'fulfilled' ? a9Result.value.reasonCode : null;
    const a9PreConfidence = a9Result.status === 'fulfilled' ? a9Result.value.confidence : 'low';
    await prisma.governanceLog.create({
      data: {
        session_id: sessionId,
        turn_number: newTurnCount,
        gate: 'A9-PRE',
        decision: 'Blocked',
        violation_type: a9PreReasonCode ?? 'unavailable',
        confidence: a9PreConfidence,
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
    ...(fallbackSource ? { fallbackSource } : {}),
    failureReason: a2FailureReason,
    estimatedIntensity,
    toolCard,
    journalPromptSuggested,
    ...(testMode?.captureSignalBus ? { signals } : {}),
  };
}
