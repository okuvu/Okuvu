/**
 * A14 — the boundary between "a submission arrived" and "a score exists".
 *
 * Same contract as the process specialists (see shared/specialist.ts):
 *
 *  - A14 writes a *measurement*, never prose. A12 is the only agent allowed
 *    to produce text a client reads, so nothing here formats a score into a
 *    sentence — not even a friendly one.
 *  - A14 cannot diagnose. `bandIsDiagnostic` and `interpretedAsDiagnosis` are
 *    typed as the literal `false` and copied straight from the scorer; this
 *    layer is not permitted to reinterpret them.
 *  - on any unexpected failure it returns a null payload, not a plausible
 *    zero. A missing score is recoverable on the next submission; an invented
 *    one silently corrupts a client's progress chart forever.
 *
 * No LLM import, by design: scoring nine integers is arithmetic, and an agent
 * that can ask a model for a number will eventually be asked a leading
 * question.
 */

import { INSTRUMENT_ID, scoreAssessment } from './scoring.js';
import type { AssessmentResult, AssessmentSubmission, PreviousAssessment } from './types.js';

export const A14_AGENT_ID = 'A14' as const;

export interface A14Input {
  submission: AssessmentSubmission;
  /** Prior score for this client and instrument, or null on a first session. */
  previous?: PreviousAssessment | null;
}

export interface A14Output {
  agentId: typeof A14_AGENT_ID;
  payload: AssessmentResult | null;
  fallbackUsed: boolean;
  /** `invalid_submission`, `unexpected_error`, or null on success. */
  failureReason: string | null;
  /** Every validation problem, so a reviewer can see the whole list at once. */
  errors: string[];
}

/** Only the one instrument A14 knows how to score. */
export function isSupportedInstrument(instrument: string): boolean {
  return instrument === INSTRUMENT_ID;
}

/**
 * Scores a submission and wraps the outcome in the fail-closed envelope the
 * orchestrator expects. Total by construction: the catch is defence in depth
 * against a future edit to the scorer, not an expected path.
 */
export function assessSubmission(input: A14Input): A14Output {
  try {
    const result = scoreAssessment(input.submission, input.previous ?? undefined);

    if (result.ok) {
      return {
        agentId: A14_AGENT_ID,
        payload: result,
        fallbackUsed: false,
        failureReason: null,
        errors: [],
      };
    }

    return {
      agentId: A14_AGENT_ID,
      payload: null,
      fallbackUsed: true,
      failureReason: 'invalid_submission',
      errors: result.errors,
    };
  } catch {
    return {
      agentId: A14_AGENT_ID,
      payload: null,
      fallbackUsed: true,
      failureReason: 'unexpected_error',
      errors: ['submission: scoring failed unexpectedly'],
    };
  }
}
