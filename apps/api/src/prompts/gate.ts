/**
 * Which A2 prompt is allowed to be the default.
 *
 * Owner's instruction, 24 November 2026: "Make it strict: no prompt becomes the
 * default unless it passes. Keep the current live prompt as the default until
 * the new one passes."
 *
 * Before this file, "the default" was whichever filename the last commit
 * happened to point A2_PROMPT_VERSION at. v2.7 was made the default in the same
 * change that first scored it, and its score did not pass. That is the failure
 * this file removes: the decision is now a record with a run behind it, and the
 * code reads the record instead of a prompt file name chosen by hand.
 *
 * The rule, enforced by `__tests__/prompt-gate.test.ts` against the evidence
 * files themselves, not against this comment:
 *
 *   • a version may be the default only if its state is `passed` or
 *     `in_production`;
 *   • `passed` requires an evidence report that exists and says `gate_met: true`
 *     for that exact version;
 *   • `failed` requires an evidence report that exists and says `gate_met:
 *     false` — a version cannot be marked failed by opinion;
 *   • `not_run` can never be the default.
 *
 * `in_production` exists for one honest reason: v2.6 is live today and predates
 * the strict gate. Calling it `passed` would be a lie (it did not pass — it
 * fails the same two categories), and demoting it would take a working product
 * off the prompt its clients are already talking to. It is grandfathered, and
 * it says so. Every version after it goes through `passed`.
 *
 * THE ORDER IS THE ORDER OF PROMOTION. The newest eligible entry wins, so
 * append new versions at the end; do not reorder.
 */

export type PromptGateState = 'in_production' | 'passed' | 'failed' | 'not_run';

export interface PromptGateEntry {
  version: string;
  state: PromptGateState;
  /**
   * Repo-relative path to the run report that decided this state, or null for
   * `not_run`. The test reads it, so a state cannot outlive its evidence.
   */
  evidence: string | null;
  date: string;
  note: string;
}

export const PROMPT_GATE: PromptGateEntry[] = [
  {
    version: 'v2.6',
    state: 'in_production',
    evidence: 'evidence/v26-baseline/run-1.json',
    date: '2026-11-23',
    note:
      'Live in production. Grandfathered: it predates the strict gate and fails ' +
      'the same two categories v2.7 does (scope_boundary, fail_closed), so it is ' +
      'not marked passed. It stays default until a version passes.',
  },
  {
    version: 'v2.7',
    state: 'failed',
    evidence: 'evidence/v27-goldset/run-1.json',
    date: '2026-11-24',
    note:
      'Owner-approved worksheet paragraph. Scored 357/369 with scope_boundary and ' +
      'fail_closed below their hard thresholds (sb-03 confidentiality promise, ' +
      'fc-05 fallback copy vs rubric). Not eligible to be the default.',
  },
];

/** Whether this entry is allowed to supply the default prompt. */
export function isEligibleAsDefault(entry: PromptGateEntry): boolean {
  return entry.state === 'passed' || entry.state === 'in_production';
}

/**
 * The version the product serves.
 *
 * Throws rather than returning a guess: a build with no eligible prompt has no
 * safe answer, and silently serving the newest file is exactly the bug this
 * module exists to prevent.
 */
export function defaultPromptVersion(entries: PromptGateEntry[] = PROMPT_GATE): string {
  const eligible = entries.filter(isEligibleAsDefault);
  if (eligible.length === 0) {
    throw new Error('no A2 prompt is eligible to be the default — see src/prompts/gate.ts');
  }
  return eligible[eligible.length - 1].version;
}

/** The gate entry for a version, or undefined. */
export function promptGateEntry(version: string): PromptGateEntry | undefined {
  return PROMPT_GATE.find((entry) => entry.version === version);
}
