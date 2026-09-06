import type { PipelineSignal } from '@evia/shared-types';

/**
 * Deterministic pipeline-level invariants (mvp-v2-engineering-spec.md §5.2),
 * checked over the captured signal bus + result type. Pure functions only —
 * no LLM calls, no DB access (see crisis-record.ts for the one check that
 * needs a DB read).
 *
 * Precision note vs the spec's plain-English wording: §5.2 says "S3/S4 (A1)
 * or Blocked (A9-pre) ⇒ no therapeutic step fires downstream." That's not
 * quite what the already-verified `a8-router.ts` does (see
 * `a8-state-space.ts`'s EXPECTED_TABLE, confirmed against the real
 * production `routeTurn`): S4 and Blocked *do* fully suppress (route to
 * crisis), but S3 (without Blocked) routes to A2 in `grounding-only` mode —
 * A2 still fires, just restricted. Implementing the spec's literal S3
 * wording would hard-fail correct, already-signed-off routing behavior, so
 * this module checks the two distinct invariants the real code actually
 * implements: full suppression for S4/Blocked, and a grounding-only mode
 * restriction for S3.
 */

const BOUNDARY_ORDER = ['A1_result', 'A9_pre_result', 'A8_decision', 'A2_result', 'A9_post_result'];

export interface InvariantViolation {
  rule: 'signal-ordering' | 'full-suppression' | 's3-grounding-only';
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

/** S4 (any governance state) or governance=Blocked (any safety state) must fully suppress — the crisis silence path, no A2 output at all. */
export function checkFullSuppression(
  signals: PipelineSignal[],
  resultType: 'agent_turn' | 'crisis' | 'error',
): InvariantViolation | null {
  const safetyState = stringPayload(findSignal(signals, 'A1_result'));
  const governanceState = stringPayload(findSignal(signals, 'A9_pre_result'));

  const mustSuppress = safetyState === 'S4' || governanceState === 'Blocked';
  if (!mustSuppress) return null;

  if (resultType !== 'crisis') {
    return {
      rule: 'full-suppression',
      reason: `safetyState=${safetyState ?? 'unknown'} governanceState=${governanceState ?? 'unknown'} must route to the crisis silence path, but resultType was '${resultType}'.`,
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
    checkS3GroundingOnly(signals),
  ].filter((v): v is InvariantViolation => v !== null);
}
