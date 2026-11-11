/**
 * TH-S38 — folding one simulated conversation into a verdict.
 *
 * Precedence is deliberate and first-match-wins: a conversation resolves to
 * exactly one of PASS / FAIL / UNGRADED / INCOMPLETE (or RUNNING while it has
 * not finished). The order exists because later signals cannot outvote earlier
 * ones — a judge saying "this reply is fine" must never launder a fallback
 * turn, and an ungraded conversation must never be rounded into a pass.
 *
 *   1. a turn that errored                        → FAIL (error)
 *   2. group stopped for a worker/budget reason    → INCOMPLETE
 *   3. fallback / loop / invariant / canned leak   → FAIL (hard)
 *   4. any C1–C5 continuity assert failed          → FAIL (continuity)
 *   5. the judge failed a session                  → FAIL (quality)
 *   6. nothing was gradeable                       → UNGRADED
 *   7. otherwise                                   → PASS
 *
 * Pure: takes persisted evidence, returns a verdict. No DB, no model, no clock.
 */

import type { PerTurnTrace } from './trace-export';
import { evaluateChatQuality, type QualityFinding } from './chat-quality';

export type CampaignVerdict = 'PASS' | 'FAIL' | 'UNGRADED' | 'INCOMPLETE' | 'RUNNING';

export type VerdictCode =
  | 'pass'
  | 'error'
  | 'incomplete'
  | 'hard_fail'
  | 'continuity'
  | 'quality'
  | 'ungraded'
  | 'running';

export type ContinuityKey = 'C1' | 'C2' | 'C3' | 'C4' | 'C5';

export interface JudgeVerdictRecord {
  sessionIndex: number;
  judged: boolean;
  passed: boolean | null;
  rationale: string;
}

export interface GroupEvidence {
  /** ConversationRun.environment for this group. */
  environment: string;
  /** ConversationRun.status for this group. */
  groupStatus: string;
  incompleteReason: string | null;
  /** True when the harness ran under canned responses outside sandbox (hygiene leak). */
  cannedLeak: boolean;
  sessions: {
    index: number;
    continuity: Partial<Record<ContinuityKey, string>>;
  }[];
  turns: PerTurnTrace[];
  judgeVerdicts: JudgeVerdictRecord[];
  /** Whether the persona carries rubric shorthand (expectedBehavior). */
  rubricPresent: boolean;
  judgeEnabled: boolean;
}

export interface GroupVerdict {
  verdict: CampaignVerdict;
  code: VerdictCode;
  /** One sentence, written for the operator reading the results table. */
  reason: string;
  findings: QualityFinding[];
  checks: {
    erroredTurns: number;
    fallbackTurns: number;
    invariantViolations: number;
    continuityFailures: string[];
    judgedSessions: number;
    failedJudgeSessions: number;
    ungradedSessions: number;
  };
}

const TERMINAL_GROUP_STATUSES = new Set(['complete', 'incomplete', 'halt']);

export function foldGroupVerdict(evidence: GroupEvidence): GroupVerdict {
  const findings = evaluateChatQuality(evidence.turns);

  const erroredTurns = evidence.turns.filter((turn) => turn.resultType === 'error').length;
  const fallbackTurns = evidence.turns.filter((turn) => turn.fallbackUsed).length;
  const invariantViolations = evidence.turns.reduce(
    (total, turn) => total + (turn.invariantViolations?.length ?? 0),
    0,
  );

  const continuityFailures: string[] = [];
  for (const session of evidence.sessions) {
    for (const key of ['C1', 'C2', 'C3', 'C4', 'C5'] as ContinuityKey[]) {
      if (session.continuity?.[key] === 'fail') {
        continuityFailures.push(`session ${session.index}: ${key}`);
      }
    }
  }

  const judgedVerdicts = evidence.judgeVerdicts.filter((verdict) => verdict.judged);
  const failedJudgeVerdicts = judgedVerdicts.filter((verdict) => verdict.passed === false);
  const ungradedSessions = evidence.judgeVerdicts.filter((verdict) => !verdict.judged).length;

  const checks = {
    erroredTurns,
    fallbackTurns,
    invariantViolations,
    continuityFailures,
    judgedSessions: judgedVerdicts.length,
    failedJudgeSessions: failedJudgeVerdicts.length,
    ungradedSessions,
  };

  if (!TERMINAL_GROUP_STATUSES.has(evidence.groupStatus)) {
    return {
      verdict: 'RUNNING',
      code: 'running',
      reason:
        evidence.groupStatus === 'planned'
          ? 'Not started yet — no turns have run.'
          : 'Still running — the verdict is decided when the last session closes.',
      findings,
      checks,
    };
  }

  // 1. A turn that errored.
  if (erroredTurns > 0) {
    return {
      verdict: 'FAIL',
      code: 'error',
      reason: `${erroredTurns} turn${erroredTurns === 1 ? '' : 's'} returned an error from the pipeline.`,
      findings,
      checks,
    };
  }

  // 2. The run stopped early for a worker or budget reason — excluded, never passed.
  if (evidence.groupStatus === 'incomplete') {
    return {
      verdict: 'INCOMPLETE',
      code: 'incomplete',
      reason: evidence.incompleteReason ?? 'The run stopped before it finished — this conversation proves nothing either way.',
      findings,
      checks,
    };
  }

  // 2b. Sandbox answers are canned template text, not the model. A sandbox
  // campaign is a plumbing rehearsal, so it is reported as UNGRADED rather
  // than letting template repetition masquerade as a quality failure (or,
  // worse, letting a clean template chain look like a pass).
  if (evidence.environment === 'sandbox') {
    return {
      verdict: 'UNGRADED',
      code: 'ungraded',
      reason:
        'Sandbox run — the harness answers with canned template text, so this exercises the plumbing, not the model. Re-run in staging for a quality verdict.',
      findings,
      checks,
    };
  }

  // 3. Silently degraded: fallback copy, a loop, a broken invariant, a canned leak.
  const hardFindings = findings.filter((finding) => finding.severity === 'fail');
  if (hardFindings.length > 0) {
    return {
      verdict: 'FAIL',
      code: 'hard_fail',
      reason: hardFindings[0].detail,
      findings,
      checks,
    };
  }
  if (evidence.cannedLeak) {
    return {
      verdict: 'FAIL',
      code: 'hard_fail',
      reason: 'Ran under canned responses outside sandbox — a canned reply must never be presented as a real-model result.',
      findings,
      checks,
    };
  }
  if (invariantViolations > 0) {
    return {
      verdict: 'FAIL',
      code: 'hard_fail',
      reason: `${invariantViolations} pipeline invariant violation${invariantViolations === 1 ? '' : 's'} (signal ordering or suppression).`,
      findings,
      checks,
    };
  }
  if (fallbackTurns > 0) {
    return {
      verdict: 'FAIL',
      code: 'hard_fail',
      reason: `${fallbackTurns} turn${fallbackTurns === 1 ? '' : 's'} used the fallback reply — the agent degraded silently.`,
      findings,
      checks,
    };
  }
  if (evidence.groupStatus === 'halt') {
    return {
      verdict: 'FAIL',
      code: 'hard_fail',
      reason: evidence.incompleteReason ?? 'The runner halted this conversation (hard-fail rule).',
      findings,
      checks,
    };
  }

  // 4. Continuity across the session gap.
  if (continuityFailures.length > 0) {
    return {
      verdict: 'FAIL',
      code: 'continuity',
      reason: `Continuity broke (${continuityFailures.join(', ')}) — the client was forgotten across a session boundary.`,
      findings,
      checks,
    };
  }

  // 5. The judge.
  if (failedJudgeVerdicts.length > 0) {
    return {
      verdict: 'FAIL',
      code: 'quality',
      reason: failedJudgeVerdicts[0].rationale || 'The judge marked the reply as not meeting the persona rubric.',
      findings,
      checks,
    };
  }

  // 6. Nothing to grade is not a pass.
  if (!evidence.judgeEnabled) {
    return {
      verdict: 'UNGRADED',
      code: 'ungraded',
      reason: 'The judge was switched off for this campaign — this conversation has no quality verdict.',
      findings,
      checks,
    };
  }
  if (!evidence.rubricPresent) {
    return {
      verdict: 'UNGRADED',
      code: 'ungraded',
      reason: 'This persona has no expectedBehavior rubric, so the reply cannot be graded. Add one and re-run.',
      findings,
      checks,
    };
  }
  if (judgedVerdicts.length === 0) {
    return {
      verdict: 'UNGRADED',
      code: 'ungraded',
      reason: 'The judge could not grade any session (it failed or returned no verdict) — counted as ungraded, not a pass.',
      findings,
      checks,
    };
  }

  // 7. Clean.
  return {
    verdict: 'PASS',
    code: 'pass',
    reason:
      ungradedSessions > 0
        ? `Passed on ${judgedVerdicts.length} judged session${judgedVerdicts.length === 1 ? '' : 's'}; ${ungradedSessions} session${ungradedSessions === 1 ? '' : 's'} could not be graded.`
        : `Passed on ${judgedVerdicts.length} judged session${judgedVerdicts.length === 1 ? '' : 's'}.`,
    findings,
    checks,
  };
}

/** Roll a campaign's group verdicts into one status string. */
export function rollupCampaignStatus(statuses: string[]): 'planned' | 'running' | 'complete' | 'incomplete' | 'halt' {
  if (statuses.length === 0) return 'planned';
  if (statuses.every((status) => status === 'planned')) return 'planned';
  if (statuses.some((status) => status === 'planned' || status === 'running')) return 'running';
  if (statuses.some((status) => status === 'incomplete')) return 'incomplete';
  if (statuses.some((status) => status === 'halt')) return 'halt';
  return 'complete';
}
