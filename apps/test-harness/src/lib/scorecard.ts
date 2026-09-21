import type { TestRunStatus } from '@okuvu/shared-types';

/**
 * Scorecard aggregator (mvp-v2-engineering-spec.md §6.3/§7). Best-effort,
 * read-only aggregation over already-persisted `TestRun` rows — same
 * defensive philosophy as `results.ts`'s `getRun`/`getAuditArtifact`: this
 * codebase stores a different `results` JSON shape per router
 * (`pipeline.ts`/`corpus.ts`: `{ result, signals, invariantViolations }`;
 * `conversation.ts`/`simulator.ts`: `{ turns: [...] }`; `faultInjection.ts`:
 * the raw PipelineResult; `stochastic.ts`: `{ samples, ... }`), so this
 * module tries each known shape and degrades to zero/empty rather than
 * throwing on a shape it doesn't recognize.
 *
 * Scope note: "S0–S4 confusion matrix" in §6.3 implies a predicted-vs-
 * expected comparison. `CorpusCase.expected_output` is free-text rubric
 * shorthand for the LLM judge (see `judge.ts`), not a structured expected
 * safety state — there is no ground-truth label to build a real confusion
 * matrix against today. This module reports an *observed* safety-state
 * distribution instead (labelled as such), not a confusion matrix — see the
 * spec's reconciliation notes for the full explanation.
 */

interface RunLike {
  id: string;
  status: TestRunStatus;
  canned: boolean;
  results: unknown;
}

export interface InvariantViolationLike {
  rule: string;
  reason?: string;
}

interface ExtractedRunSignals {
  fallbackUsed: boolean;
  invariantViolations: InvariantViolationLike[];
  safetyStates: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safetyStateFromSignals(signals: unknown): string | null {
  if (!Array.isArray(signals)) return null;
  const a1 = signals.find(
    (s) => isRecord(s) && s.boundary === 'A1_result',
  ) as { payload?: unknown } | undefined;
  return typeof a1?.payload === 'string' ? a1.payload : null;
}

function extractTurnLike(turn: unknown): { fallbackUsed: boolean; invariantViolations: InvariantViolationLike[]; safetyState: string | null } {
  if (!isRecord(turn)) return { fallbackUsed: false, invariantViolations: [], safetyState: null };
  return {
    // A4: `fallbackSource` marks substitute paths too — older runs persisted
    // blocked turns with fallbackUsed:false, so the source field is the
    // second, honest witness.
    fallbackUsed: turn.fallbackUsed === true || typeof turn.fallbackSource === 'string',
    invariantViolations: Array.isArray(turn.invariantViolations)
      ? (turn.invariantViolations as InvariantViolationLike[])
      : [],
    safetyState: typeof turn.safetyState === 'string' ? turn.safetyState : safetyStateFromSignals(turn.signals),
  };
}

/** Best-effort extraction across every known `TestRun.results` shape in this codebase. */
export function extractRunSignals(results: unknown): ExtractedRunSignals {
  if (!isRecord(results)) {
    return { fallbackUsed: false, invariantViolations: [], safetyStates: [] };
  }

  // conversation.ts / simulator.ts shape: { turns: [...] }
  if (Array.isArray(results.turns)) {
    const perTurn = results.turns.map(extractTurnLike);
    return {
      fallbackUsed: perTurn.some((t) => t.fallbackUsed),
      invariantViolations: perTurn.flatMap((t) => t.invariantViolations),
      safetyStates: perTurn.map((t) => t.safetyState).filter((s): s is string => s !== null),
    };
  }

  // pipeline.ts / corpus.ts shape: { result, signals, invariantViolations }
  if (isRecord(results.result)) {
    const result = results.result;
    const fallbackUsed = result.type === 'agent_turn' && result.fallbackUsed === true;
    const invariantViolations = Array.isArray(results.invariantViolations)
      ? (results.invariantViolations as InvariantViolationLike[])
      : [];
    const safetyState = safetyStateFromSignals(results.signals);
    return {
      fallbackUsed,
      invariantViolations,
      safetyStates: safetyState ? [safetyState] : [],
    };
  }

  // faultInjection.ts shape: the raw PipelineResult itself (no wrapper).
  if (typeof results.type === 'string') {
    const fallbackUsed = results.type === 'agent_turn' && results.fallbackUsed === true;
    const safetyState = safetyStateFromSignals(results.signals);
    return {
      fallbackUsed,
      invariantViolations: [],
      safetyStates: safetyState ? [safetyState] : [],
    };
  }

  // Unrecognized shape (e.g. stochastic.ts's { samples, ... }) — degrade to empty.
  return { fallbackUsed: false, invariantViolations: [], safetyStates: [] };
}

export interface ScorecardStats {
  totalRuns: number;
  statusCounts: Record<string, number>;
  passRate: number;
  cannedCount: number;
  fallbackCount: number;
  invariantViolationCounts: Record<string, number>;
  observedSafetyStateCounts: Record<string, number>;
}

export function computeScorecard(runs: RunLike[]): ScorecardStats {
  const statusCounts: Record<string, number> = {};
  const invariantViolationCounts: Record<string, number> = {};
  const observedSafetyStateCounts: Record<string, number> = {};
  let cannedCount = 0;
  let fallbackCount = 0;

  // B1 (OKUVU — Plumbing Fixes & Rationale v1.0): 'incomplete' runs are
  // EXCLUDED from aggregation entirely — they are counted in statusCounts
  // (so the exclusion is itself visible) but contribute nothing else, and
  // 'running' runs are excluded the same way (they haven't finished). A run
  // whose A13/A15 stage no-oped used to score as a clean pass here — the
  // exact "scorecard currently lies" failure the doc calls out.
  const EXCLUDED_FROM_AGGREGATION: ReadonlySet<string> = new Set(['incomplete', 'running']);

  for (const run of runs) {
    statusCounts[run.status] = (statusCounts[run.status] ?? 0) + 1;
    if (EXCLUDED_FROM_AGGREGATION.has(run.status)) continue;
    if (run.canned) cannedCount += 1;

    const extracted = extractRunSignals(run.results);
    if (extracted.fallbackUsed) fallbackCount += 1;
    for (const violation of extracted.invariantViolations) {
      invariantViolationCounts[violation.rule] = (invariantViolationCounts[violation.rule] ?? 0) + 1;
    }
    for (const state of extracted.safetyStates) {
      observedSafetyStateCounts[state] = (observedSafetyStateCounts[state] ?? 0) + 1;
    }
  }

  // Denominator excludes the same runs the loop skipped ('incomplete'/'running')
  // so the pass rate is honest — excluded runs never inflate or deflate it.
  const aggregatedRuns = runs.filter((r) => !EXCLUDED_FROM_AGGREGATION.has(r.status)).length;
  const passRate = aggregatedRuns > 0 ? (statusCounts.pass ?? 0) / aggregatedRuns : 0;

  return {
    totalRuns: runs.length,
    statusCounts,
    passRate,
    cannedCount,
    fallbackCount,
    invariantViolationCounts,
    observedSafetyStateCounts,
  };
}

export interface ScorecardDelta {
  passRateDelta: number;
  newInvariantViolationRules: string[];
  fallbackCountDelta: number;
}

/** Compare a "current" scorecard against a pinned baseline's scorecard. */
export function diffScorecards(current: ScorecardStats, baseline: ScorecardStats): ScorecardDelta {
  const baselineRules = new Set(Object.keys(baseline.invariantViolationCounts));
  const newInvariantViolationRules = Object.keys(current.invariantViolationCounts).filter(
    (rule) => !baselineRules.has(rule),
  );

  return {
    passRateDelta: current.passRate - baseline.passRate,
    newInvariantViolationRules,
    fallbackCountDelta: current.fallbackCount - baseline.fallbackCount,
  };
}
