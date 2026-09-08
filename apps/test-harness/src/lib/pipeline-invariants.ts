import type { PipelineSignal } from '@okuvu/shared-types';

/**
 * Deterministic pipeline-level invariants (mvp-v2-engineering-spec.md §5.2),
 * checked over the captured signal bus + result type. Pure functions only —
 * no LLM calls, no DB access (see crisis-record.ts for the one check that
 * needs a DB read).
 *
 * Precision note vs the spec's plain-English wording: §5.2 says "S3/S4 (A1)
 * or Blocked (A9-pre) ⇒ no therapeutic step fires downstream." That's not
 * quite what `a8-router.ts` does: S4 fully suppresses (routes to crisis),
 * S3 (without Blocked) routes to A2 in `grounding-only` mode — A2 still
 * fires, just restricted — and Blocked (without S4) routes to A2 in
 * `blocked` mode — a real, persisted turn with a static policy-boundary
 * reply, never the crisis silence path.
 *
 * Audit note (2026-09-07, OKUVU finding H-2): this module previously
 * treated "Blocked (any safety state) ⇒ crisis" as the correct, verified
 * invariant — because that was what `a8-router.ts` actually did at the
 * time. That was itself the bug: a policy-level Blocked verdict was being
 * coerced onto the clinical crisis path, silently dropping the turn (no
 * response, no persisted record) for messages A1 had already scored as
 * non-crisis. `a8-router.ts` and `a8-state-space.ts`'s EXPECTED_TABLE were
 * both fixed alongside this file — crisis is now reserved for A1=S4 only.
 */

const BOUNDARY_ORDER = ['A1_result', 'A9_pre_result', 'A8_decision', 'A2_result', 'A9_post_result'];

export interface InvariantViolation {
  rule: 'signal-ordering' | 'full-suppression' | 's3-grounding-only' | 'governance-blocked-not-crisis';
  reason: string;
}

function findSignal(signals: PipelineSignal[], boundary: string): PipelineSignal | undefined {
  return signals.find((s) => s.boundary === boundary);
}

function stringPayload(signal: PipelineSignal | undefined): string | null {
  return typeof signal?.payload === 'string' ? signal.payload : null;
}

/** Boundaries must appear in strict pipeline order: A1 -> A9-pre -> A8 -> A2 -> A9-post. */
export function checkSignalOrdering(signals: PipelineSignal[]): InvariantViolation | null {
  const present = signals.map((s) => s.boundary).filter((b) => BOUNDARY_ORDER.includes(b));
  const expected = BOUNDARY_ORDER.filter((b) => present.includes(b));

  for (let i = 0; i < present.length; i++) {
    if (present[i] !== expected[i]) {
      return {
        rule: 'signal-ordering',
        reason: `Expected boundary order [${expected.join(' > ')}], got [${present.join(' > ')}].`,
      };
    }
  }
  return null;
}

/**
 * S4 and the crisis silence path must imply each other exactly —
 * `safetyState === 'S4' <=> resultType === 'crisis'`, regardless of
 * governance state. Checked in both directions: this used to only check
 * S4-without-crisis; a live E2E re-run of the OKUVU findings (2026-09-07)
 * caught that crisis-without-S4 (forced via a testMode override, simulating
 * a future regression unrelated to the specific Blocked-coercion bug)
 * slipped through both this check and `checkGovernanceBlockedMode` when
 * governance wasn't Blocked — neither one is scoped to catch a generic
 * "crisis fired for the wrong reason" case. This closes that gap.
 */
export function checkFullSuppression(
  signals: PipelineSignal[],
  resultType: 'agent_turn' | 'crisis' | 'error',
): InvariantViolation | null {
  const safetyState = stringPayload(findSignal(signals, 'A1_result'));

  if (safetyState === 'S4' && resultType !== 'crisis') {
    return {
      rule: 'full-suppression',
      reason: `safetyState=S4 must route to the crisis silence path, but resultType was '${resultType}'.`,
    };
  }
  if (resultType === 'crisis' && safetyState !== 'S4') {
    return {
      rule: 'full-suppression',
      reason: `resultType='crisis' but safetyState=${safetyState ?? 'unknown'} (not S4) — crisis must be reserved exclusively for S4.`,
    };
  }
  return null;
}

/**
 * Governance=Blocked at a non-S4 safety state must route to A2 in
 * mode='blocked' — a real, persisted turn with a static policy-boundary
 * reply. (Blocked never legitimately reaching the crisis path at all is
 * covered generally by `checkFullSuppression` above; this check only
 * asserts the specific positive-path routing mode.) This is the inverse of
 * a bug this module used to encode as correct (OKUVU finding H-2,
 * 2026-09-07): Blocked was being coerced onto the crisis path, silently
 * dropping turns A1 had already scored as non-crisis.
 */
export function checkGovernanceBlockedMode(
  signals: PipelineSignal[],
  resultType: 'agent_turn' | 'crisis' | 'error',
): InvariantViolation | null {
  const safetyState = stringPayload(findSignal(signals, 'A1_result'));
  const governanceState = stringPayload(findSignal(signals, 'A9_pre_result'));
  if (governanceState !== 'Blocked' || safetyState === 'S4' || resultType !== 'agent_turn') return null;

  const a8Decision = findSignal(signals, 'A8_decision')?.payload as { mode?: string } | undefined;
  if (a8Decision?.mode !== 'blocked') {
    return {
      rule: 'governance-blocked-not-crisis',
      reason: `governanceState=Blocked with safetyState=${safetyState ?? 'unknown'} must route A2 to mode='blocked', got mode='${a8Decision?.mode ?? 'unknown'}'.`,
    };
  }
  return null;
}

/** S3 (without a Blocked override) must route A2 to grounding-only mode — A2 still fires, but restricted, never 'normal'/'alliance-building'. */
export function checkS3GroundingOnly(signals: PipelineSignal[]): InvariantViolation | null {
  const safetyState = stringPayload(findSignal(signals, 'A1_result'));
  const governanceState = stringPayload(findSignal(signals, 'A9_pre_result'));
  if (safetyState !== 'S3' || governanceState === 'Blocked') return null;

  const a8Decision = findSignal(signals, 'A8_decision')?.payload as { mode?: string } | undefined;
  if (a8Decision?.mode !== 'grounding-only') {
    return {
      rule: 's3-grounding-only',
      reason: `S3 (governance not Blocked) must route A2 to mode='grounding-only', got mode='${a8Decision?.mode ?? 'unknown'}'.`,
    };
  }
  return null;
}

/** Run every deterministic pipeline invariant, returning all violations found (empty array when clean). */
export function checkPipelineInvariants(
  signals: PipelineSignal[],
  resultType: 'agent_turn' | 'crisis' | 'error',
): InvariantViolation[] {
  return [
    checkSignalOrdering(signals),
    checkFullSuppression(signals, resultType),
    checkGovernanceBlockedMode(signals, resultType),
    checkS3GroundingOnly(signals),
  ].filter((v): v is InvariantViolation => v !== null);
}
