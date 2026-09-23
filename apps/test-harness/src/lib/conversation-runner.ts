/**
 * TH-S34 + TH-S37 — Simulated-Conversation Runner Spec v1.1: the
 * multi-session orchestrator.
 *
 * Drives ONE synthetic persona (a type='persona' CorpusCase, TH-S32) across
 * N SessionLog rows sharing one synthetic user thread, with the user side
 * played by the TH-S33 user-simulator:
 *
 *   for each session s in 1..N (gapPlanMs[s-1] injected as gap_before_ms):
 *     loop turns:
 *       user turn  ← user-simulator (persona + history + gap)
 *       → processTurn(A1→A9-pre→A8→A2→A9-post)  — per-turn trace + invariants
 *       → asserts: C5 suppression (per turn)
 *     closeSession() → worker summary + memory
 *     → asserts: C1 (summary+memory written), C3 (no reset-on-affirmation),
 *                C4 (no trait drift) per session; C2 planted-fact recall
 *                asserted on the next session's turns
 *   every step is idempotent/resumable from durable state (TH-S35's tick)
 *
 * Story-time mode (the default) injects the planned gap as `gap_before_ms`
 * telemetry — days become seconds; no clock is needed. Wall-clock scheduling
 * lives in the run-batch endpoint (TH-S35), not here: this module advances
 * exactly the step it is told to.
 *
 * Rails enforced inline (TH-S37): cost ceiling (hard stop → 'incomplete'),
 * staging-only guard, canned-refusal guard. The crisis → review-queue rail
 * is satisfied by routing: crisis turns already produce TestRun rows that
 * the existing review pipeline surfaces.
 */

import { prisma } from './prisma';
import { createSyntheticThread, openSyntheticSession, runFullPipeline } from './pipeline-runner';
import { closeSessionDirect } from './session-close-runner';
import { generateUserTurn, resolveSimulatorModel, type PersonaMetaForSimulation } from './user-simulator';
import { checkPipelineInvariants, type InvariantViolation } from './pipeline-invariants';
import { assertWorkerHealthOrIncomplete } from './worker-health';
import { buildRunHeader } from './run-identity';
import { hasDegenerateLoop } from './hard-fail-rules';
import {
  assertNoResetOnAffirmation,
  assertNoTraitDrift,
  assertPlantedFactRecall,
  assertSuppression,
  type ContinuityVerdict,
} from './continuity-asserts';
import type { PerTurnTrace } from './trace-export';

export type SchedulerMode = 'story-time' | 'wall-clock';

export interface SessionPlan {
  sessions: number;
  turnsPerSession: { min: number; max: number };
  gapPlanMs: number[];
}

export interface ConversationRunnerOptions {
  environment: 'staging' | 'sandbox';
  persona: {
    caseId: string;
    personaId: string;
    personaVersion: string;
    meta: PersonaMetaForSimulation;
    /** Ordered seed script the simulator continues from (may be empty). */
    seedTurns: string[];
  };
  plan: SessionPlan;
  schedulerMode: SchedulerMode;
  seed: number;
  costCeilingUsd: number;
}

/** A single session's execution record (§6.4 sessions[] contract). */
export interface SessionRecord {
  index: number;
  sessionId: string;
  gapBeforeMs: number;
  turnsPlanned: number;
  turnsCompleted: number;
  summaryWritten: boolean;
  memoryWritten: boolean;
  runIds: string[];
  continuity: Record<'C1' | 'C2' | 'C3' | 'C4' | 'C5', ContinuityVerdict>;
}

export interface ConversationRunnerState {
  uid: string;
  userId: string;
  /** Flat history so far (user/assistant pairs across all sessions). */
  history: { role: 'user' | 'assistant'; text: string }[];
  sessionIndex: number;
  turnInSession: number;
  turnsThisSession: number;
  sessions: SessionRecord[];
  /** The planted-fact verdict carried from the previous session (C2). */
  pendingRecall: { fact: string } | null;
  costSoFarUsd: number;
  status: 'running' | 'complete' | 'incomplete' | 'halt';
  incompleteReason: string | null;
}

// ─── Rails (TH-S37) ─────────────────────────────────────────────────────────

/**
 * Environment + hygiene guard: the runner is staging-only (spec Table 5
 * "staging only; refuse beta/production"); sandbox is allowed explicitly
 * for free deterministic dry-runs. A canned leak (USE_CANNED_LLM_RESPONSE
 * set in-process) is refused outside sandbox.
 */
export function assertRunnerRails(environment: string): void {
  if (environment === 'beta' || environment === 'production') {
    throw new Error('ConversationRun refused: the simulated-conversation runner is staging-only (sandbox allowed for dry-runs).');
  }
  if (environment !== 'sandbox' && process.env.USE_CANNED_LLM_RESPONSE === 'true') {
    throw new Error('ConversationRun refused: USE_CANNED_LLM_RESPONSE is set — a canned run must never be presented as a real-model result (spec rail: hygiene).');
  }
}

/** Rough per-turn cost estimate in USD from the recorded usage (spec §7: cheap but not free). */
function estimateTurnCostUsd(usage: { promptTokens: number; completionTokens: number } | null): number {
  if (!usage) return 0;
  // Order-of-magnitude rates for the small models in play (USD per 1M tokens:
  // ~$0.05 input / ~$0.08 output on Llama-3.1-8B, similar band for flash-class
  // simulator models). Deliberately conservative (rounds up).
  const inputUsd = (usage.promptTokens / 1_000_000) * 0.05;
  const outputUsd = (usage.completionTokens / 1_000_000) * 0.08;
  return inputUsd + outputUsd;
}

/** Deterministic per-session turn count in [min, max] from the run seed. */
export function turnsForSession(seed: number, sessionIndex: number, min: number, max: number): number {
  if (max <= min) return min;
  // xorshift-style deterministic draw — no Math.random in the plan path.
  const x = Math.imul(seed ^ (sessionIndex * 0x9e3779b9), 0x85ebca6b) >>> 0;
  return min + (x % (max - min + 1));
}

/**
 * Build the initial resumable state: one synthetic thread, session 1 opened.
 * The run-batch tick (TH-S35) persists/reconstructs this from ConversationRun
 * rows; this module exposes it as a plain object so the tick can serialize it
 * into ConversationRun.next_step + sessions without a second code path.
 */
export async function initializeRunState(options: ConversationRunnerOptions): Promise<ConversationRunnerState> {
  const { uid, userId } = await createSyntheticThread('runner');
  const { sessionId } = await openSyntheticSession(uid);

  const turnsThisSession = turnsForSession(
    options.seed,
    1,
    options.plan.turnsPerSession.min,
    options.plan.turnsPerSession.max,
  );

  return {
    uid,
    userId,
    history: [],
    sessionIndex: 1,
    turnInSession: 1,
    turnsThisSession,
    sessions: [
      {
        index: 1,
        sessionId,
        gapBeforeMs: options.plan.gapPlanMs[0] ?? 0,
        turnsPlanned: turnsThisSession,
        turnsCompleted: 0,
        summaryWritten: false,
        memoryWritten: false,
        runIds: [],
        continuity: { C1: 'pass', C2: 'not_applicable', C3: 'pass', C4: 'pass', C5: 'pass' },
      },
    ],
    pendingRecall: null,
    costSoFarUsd: 0,
    status: 'running',
    incompleteReason: null,
  };
}

export interface AdvanceStepResult {
  /** Whether a step actually ran (false = idempotent no-op / already done). */
  stepped: boolean;
  state: ConversationRunnerState;
  /** The per-turn trace rows produced this step (1 for a turn, 0 for a close). */
  traces: PerTurnTrace[];
  /** TestRun ids created this step (1 for a turn, 1 more on session close). */
  runIds: string[];
  done: boolean;
}

/**
 * Advance the run by exactly ONE step (one turn, or the session close when
 * the session's turns are done). Purely driven from `state` — this is what
 * makes the run resumable (TH-S35): any tick reconstructs state from durable
 * ConversationRun columns and calls this; a crash loses at most one turn.
 */
export async function advanceRunStep(
  options: ConversationRunnerOptions,
  state: ConversationRunnerState,
): Promise<AdvanceStepResult> {
  if (state.status !== 'running') {
    return { stepped: false, state, traces: [], runIds: [], done: true };
  }

  const session = state.sessions[state.sessions.length - 1];
  const gapBeforeMs = session.gapBeforeMs;

  // ── Step A: session close (when this session's turns are complete) ──
  if (state.turnInSession > state.turnsThisSession) {
    const closeOutcome = await closeSessionDirect(session.sessionId, state.uid);
    session.summaryWritten = closeOutcome.summaryWritten;
    session.memoryWritten = closeOutcome.memoryWritten;

    // C1 — memory written: the summary/memory stage must actually have run.
    session.continuity.C1 = closeOutcome.processed ? 'pass' : 'fail';

    // C3 — no reset-on-affirmation (B4 regression seed, session-boundary form).
    session.continuity.C3 = assertNoResetOnAffirmation(state.history);

    // C4 — no trait drift (memory must not promote temporary state).
    if (prisma) {
      session.continuity.C4 = await assertNoTraitDrift(state.userId, options.persona.meta, prisma);
    }

    // C2 — planted-fact recall is asserted when the NEXT session produces
    // turns; carry the fact forward. Last session: not_applicable.
    if (state.pendingRecall) {
      session.continuity.C2 = 'deferred_to_next_session';
    }

    state.pendingRecall = pickPlantedFact(options.persona.meta);

    // Persist the closed session as its own TestRun row (one row per session,
    // matching the existing one-TestRun-per-run convention so the Results
    // page and bulk export work unchanged).
    const sessionIdRun = await persistSessionRun(options, state, session);
    session.runIds.push(sessionIdRun);

    // Next: open the following session, or finish.
    if (session.index >= options.plan.sessions) {
      state.status = 'complete';
      return { stepped: true, state, traces: [], runIds: [sessionIdRun], done: true };
    }

    const nextIndex = session.index + 1;
    const { sessionId: nextSessionId } = await openSyntheticSession(state.uid);
    const nextTurns = turnsForSession(
      options.seed,
      nextIndex,
      options.plan.turnsPerSession.min,
      options.plan.turnsPerSession.max,
    );
    state.sessions.push({
      index: nextIndex,
      sessionId: nextSessionId,
      gapBeforeMs: options.plan.gapPlanMs[nextIndex - 1] ?? 0,
      turnsPlanned: nextTurns,
      turnsCompleted: 0,
      summaryWritten: false,
      memoryWritten: false,
      runIds: [],
      continuity: { C1: 'pass', C2: 'not_applicable', C3: 'pass', C4: 'pass', C5: 'pass' },
    });
    state.sessionIndex = nextIndex;
    state.turnInSession = 1;
    state.turnsThisSession = nextTurns;

    return { stepped: true, state, traces: [], runIds: [sessionIdRun], done: false };
  }

  // ── Step B: cost-ceiling rail BEFORE spending (TH-S37: hard stop) ──
  if (state.costSoFarUsd >= options.costCeilingUsd) {
    state.status = 'incomplete';
    state.incompleteReason = `Cost ceiling hit: $${state.costSoFarUsd.toFixed(4)} ≥ ceiling $${options.costCeilingUsd.toFixed(2)} — run marked incomplete, never passed (TH-S37).`;
    return { stepped: false, state, traces: [], runIds: [], done: true };
  }

  // ── Step C: worker pre-flight — without the summary/memory stage a
  // session close CANNOT pass C1, so refuse to burn turns (B1 lineage). ──
  const workerHealth = await assertWorkerHealthOrIncomplete();
  if (!workerHealth.ok) {
    state.status = 'incomplete';
    state.incompleteReason = workerHealth.reason;
    return { stepped: false, state, traces: [], runIds: [], done: true };
  }

  // ── Step D: generate the user turn (TH-S33) ──
  const isFirstSessionTurn = state.turnInSession === 1;
  const isOpeningTurn = session.index === 1 && isFirstSessionTurn;
  const scriptedLine =
    isOpeningTurn && options.persona.seedTurns.length > 0 ? options.persona.seedTurns[0] : null;

  const simulated = await generateUserTurn({
    persona: options.persona.meta,
    history: state.history,
    gapBeforeMs,
    sessionIndex: session.index,
    seed: options.seed + (session.index - 1) * 1000 + state.turnInSession,
    isOpeningTurn,
    sampleStarters: options.persona.meta.sampleStarters,
  });
  const userMessage = scriptedLine ?? simulated.message;

  // ── Step E: run the real pipeline turn (A1→A9-pre→A8→A2→A9-post + worker) ──
  const start = performance.now();
  const { result, workerStage } = await runFullPipeline({
    uid: state.uid,
    sessionId: session.sessionId,
    message: userMessage,
  });
  const latencyMs = performance.now() - start;

  const signals = result.signals ?? [];
  const safetySignal = signals.find((s) => s.boundary === 'A1_result');
  const safetyState = typeof safetySignal?.payload === 'string' ? safetySignal.payload : null;
  const response = result.type === 'agent_turn' ? result.message : null;
  const fallbackUsed = result.type === 'agent_turn' && result.fallbackUsed;
  const invariantViolations: InvariantViolation[] = checkPipelineInvariants(signals, result.type);

  // C5 — suppression asserts (per turn): S4 ⇒ silence, S3 ⇒ grounding-only.
  const suppressionViolation = assertSuppression(safetyState, result.type, signals);

  // C2 — planted-fact recall against THIS turn's reply (deferred from the
  // previous session's close). Asserted on the first turns of a session.
  let recall: ContinuityVerdict = 'not_applicable';
  if (state.pendingRecall && isFirstSessionTurn && session.index > 1 && response) {
    recall = assertPlantedFactRecall(response, state.pendingRecall.fact);
  }

  state.history.push({ role: 'user', text: userMessage });
  if (response) state.history.push({ role: 'assistant', text: response });

  const trace: PerTurnTrace = {
    turnNumber: (session.index - 1) * 1000 + state.turnInSession,
    message: userMessage,
    response,
    latencyMs,
    resultType: result.type,
    safetyState,
    fallbackUsed,
    invariantViolations: suppressionViolation
      ? [...invariantViolations, { rule: 'full-suppression', reason: suppressionViolation }]
      : invariantViolations,
    signals,
  };
  session.continuity.C5 = suppressionViolation ? 'fail' : session.continuity.C5;
  if (recall !== 'not_applicable') session.continuity.C2 = recall;

  session.turnsCompleted += 1;
  state.turnInSession += 1;
  state.costSoFarUsd += estimateTurnCostUsd(simulated.usage);

  // ── Step F: persist the turn as its own TestRun (existing convention) ──
  const runId = await persistTurnRun(options, state, session, trace, workerStage);
  session.runIds.push(runId);

  // B1: a turn whose worker stage no-oped poisons the whole group.
  const workerOk = result.type === 'crisis' || (workerStage.attempted ? workerStage.ok : true);
  if (result.type === 'error') {
    state.status = 'incomplete';
    state.incompleteReason = `Turn ${trace.turnNumber}: processTurn returned an error.`;
  } else if (!workerOk) {
    state.status = 'incomplete';
    state.incompleteReason = workerStage.error ?? 'A13/A15 worker stage did not run.';
  } else if (suppressionViolation || invariantViolations.length > 0) {
    state.status = 'halt';
    state.incompleteReason = suppressionViolation ?? invariantViolations[0]?.reason ?? null;
  } else if (result.type === 'crisis') {
    // Crisis silence path: no further turns are sent to this session
    // (mirrors runPersonaScript's behavior); close it next tick.
    state.turnInSession = state.turnsThisSession + 1;
  }

  return { stepped: true, state, traces: [trace], runIds: [runId], done: state.status !== 'running' };
}

/** Pick the fact this persona plants (C2): first secret, else first goal. */
function pickPlantedFact(meta: PersonaMetaForSimulation): { fact: string } | null {
  const fact = meta.secrets?.[0] ?? meta.goals?.[0] ?? null;
  return fact ? { fact } : null;
}

async function persistTurnRun(
  options: ConversationRunnerOptions,
  state: ConversationRunnerState,
  session: SessionRecord,
  trace: PerTurnTrace,
  workerStage: { attempted: boolean; ok: boolean; error: string | null },
): Promise<string> {
  if (!prisma) throw new Error('Database not configured — DATABASE_URL is unset.');

  const status = trace.resultType === 'error' ? 'error' : state.status === 'halt' ? 'halt' : 'pass';
  const simulatorModel = resolveSimulatorModel();

  const run = await prisma.testRun.create({
    data: {
      environment: options.environment,
      altitude: 1,
      status,
      canned: false,
      ...buildRunHeader('persona_script'),
      // TH-S33/S34 telemetry (§6.3).
      persona_id: options.persona.personaId,
      persona_version: options.persona.personaVersion,
      simulator_model: simulatorModel,
      session_index: session.index,
      turn_in_session: trace.turnNumber,
      gap_before_ms: session.gapBeforeMs,
      frozen_triple: JSON.parse(
        JSON.stringify({
          modelVersion: null,
          promptHash: null,
          inputId: options.persona.caseId,
          simulatorModel,
          seed: options.seed,
        }),
      ),
      results: JSON.parse(
        JSON.stringify({
          turns: [trace],
          personaId: options.persona.personaId,
          uid: state.uid,
          userId: state.userId,
          sessionId: session.sessionId,
          sessionIndex: session.index,
          turnInSession: session.turnsCompleted,
          workerStage,
        }),
      ),
      activated_agents: [],
      manually_selected_agents: [],
      dependency_graph: {},
      completed_at: new Date(),
    },
  });
  return run.id;
}

async function persistSessionRun(
  options: ConversationRunnerOptions,
  state: ConversationRunnerState,
  session: SessionRecord,
): Promise<string> {
  if (!prisma) throw new Error('Database not configured — DATABASE_URL is unset.');

  const continuityFailed =
    session.continuity.C1 === 'fail' ||
    session.continuity.C2 === 'fail' ||
    session.continuity.C3 === 'fail' ||
    session.continuity.C4 === 'fail' ||
    session.continuity.C5 === 'fail';

  const run = await prisma.testRun.create({
    data: {
      environment: options.environment,
      altitude: 1,
      // B1 lineage: a session whose summary/memory stage no-oped is
      // 'incomplete', never clean.
      status: !session.summaryWritten || !session.memoryWritten ? 'incomplete' : continuityFailed ? 'halt' : 'pass',
      canned: false,
      ...buildRunHeader('persona_script'),
      persona_id: options.persona.personaId,
      persona_version: options.persona.personaVersion,
      simulator_model: resolveSimulatorModel(),
      session_index: session.index,
      turn_in_session: null,
      gap_before_ms: session.gapBeforeMs,
      frozen_triple: JSON.parse(JSON.stringify({ inputId: options.persona.caseId, seed: options.seed })),
      results: JSON.parse(
        JSON.stringify({
          sessionClose: true,
          sessionId: session.sessionId,
          sessionIndex: session.index,
          turns: state.history.slice(-session.turnsCompleted * 2),
          continuity: session.continuity,
        }),
      ),
      activated_agents: [],
      manually_selected_agents: [],
      dependency_graph: {},
      completed_at: new Date(),
    },
  });
  return run.id;
}

/**
 * Reconstruct the full runner state from durable TestRun rows (TH-S35:
 * "any tick reconstructs exactly where the thread left off, purely from
 * durable state"). Reads the group's member runs in creation order:
 *   - the newest turn run carries uid/userId/sessionId (persisted per turn
 *     exactly for this reconstruction);
 *   - every turn run's results.turns[0] rebuilds the flat history.
 * A crash mid-run loses at most the one turn that was in flight.
 */
export async function reconstructStateFromRuns(
  runIds: string[],
  sessionsStored: SessionRecord[],
  nextStep: { sessionIndex: number; turnNumber: number },
  options: ConversationRunnerOptions,
): Promise<ConversationRunnerState> {
  if (!prisma) throw new Error('Database not configured — DATABASE_URL is unset.');

  const runs = await prisma.testRun.findMany({
    where: { id: { in: runIds } },
    orderBy: { created_at: 'asc' },
  });

  const history: { role: 'user' | 'assistant'; text: string }[] = [];
  let uid: string | null = null;
  let userId: string | null = null;

  for (const run of runs) {
    const results = run.results as
      | { turns?: { message?: string; response?: string | null }[]; uid?: string; userId?: string; sessionClose?: boolean }
      | null;
    if (!results) continue;
    if (results.uid) uid = results.uid;
    if (results.userId) userId = results.userId;
    if (results.sessionClose) continue; // session-close rows carry no new turns
    for (const t of results.turns ?? []) {
      if (t.message) history.push({ role: 'user', text: t.message });
      if (t.response) history.push({ role: 'assistant', text: t.response });
    }
  }

  if (!uid || !userId) {
    throw new Error('Run-group reconstruction failed: no persisted thread identity found in member runs.');
  }

  const currentSession =
    sessionsStored.find((s) => s.index === nextStep.sessionIndex) ?? sessionsStored[sessionsStored.length - 1];

  return {
    uid,
    userId,
    history,
    sessionIndex: currentSession?.index ?? nextStep.sessionIndex,
    turnInSession: nextStep.turnNumber,
    turnsThisSession:
      currentSession?.turnsPlanned ??
      turnsForSession(options.seed, nextStep.sessionIndex, options.plan.turnsPerSession.min, options.plan.turnsPerSession.max),
    sessions: sessionsStored,
    pendingRecall: null,
    costSoFarUsd: 0, // overwritten by the caller from the group row
    status: 'running',
    incompleteReason: null,
  };
}

/** Convenience: whether the group as a whole is done (any terminal status). */
export function groupStatus(state: ConversationRunnerState): 'running' | 'complete' | 'incomplete' | 'halt' {
  return state.status;
}

/** Degenerate-loop helper re-exported for the run-batch endpoint's gates. */
export { hasDegenerateLoop };
