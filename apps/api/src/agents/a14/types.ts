/**
 * A14 — Assessment & Measurement.
 *
 * A14 keeps a number and nothing else. It owns the `assessment` write
 * authority (roster rule) and it is deliberately the least clever agent in the
 * system: no model call, no prose, no interpretation. A measurement that
 * drifts is worse than no measurement, because every downstream reader
 * (therapist portal, progress charts, A11 aggregates) trusts it as fact.
 *
 * The instrument is `okuvu-wellbeing-9`: nine items, each scored 0–3, total
 * 0–27. It is a *change-tracking* instrument, not a diagnostic one. Nothing
 * here may be read as a diagnosis, a severity grade, or a substitute for
 * clinical judgement — see the note above `bandIsDiagnostic` below.
 */

/** One scored item. `score` is a literal union so a 4 cannot be expressed. */
export interface AssessmentItem {
  id: string;
  score: 0 | 1 | 2 | 3;
}

/**
 * A submission as it arrives from the client (or the app that wraps it).
 *
 * `instrument` is a literal, not a `string`, so an unknown instrument is a
 * type error at the call site and a validation error at runtime.
 */
export interface AssessmentSubmission {
  clientId: string;
  instrument: 'okuvu-wellbeing-9';
  submittedAt: string;
  items: AssessmentItem[];
}

/**
 * Total-score bands. Thresholds live with the scorer (`scoring.ts`) and are
 * tested at every boundary; they are a coarse route for a clinician's
 * attention, never a label attached to a person.
 */
export type AssessmentBand = 'minimal' | 'mild' | 'moderate' | 'high';

/**
 * `change` is `total - previous.total`; direction is only ever relative to
 * this client's own previous score. There is no population comparison here
 * and there must not be one: a 12 is not "bad" on its own.
 *
 *  - `improving`  — score fell by more than the stable band
 *  - `worsening`  — score rose by more than the stable band
 *  - `stable`     — movement within measurement noise
 *  - `first_measure` — no prior score to compare against
 */
export type ChangeDirection = 'improving' | 'worsening' | 'stable' | 'first_measure';

/**
 * The prior score, as stored. `total` is validated on the way in — a corrupted
 * `previous` must fail loudly rather than produce a fictional `change`.
 */
export interface PreviousAssessment {
  total: number;
  submittedAt: string;
}

export interface AssessmentResult {
  ok: true;
  clientId: string;
  instrument: 'okuvu-wellbeing-9';
  total: number;
  maxScore: 27;
  band: AssessmentBand;
  /**
   * Non-negotiable `false`. The instrument is unvalidated in this population,
   * has no clinical sign-off, and the thresholds above were chosen for
   * routing, not for diagnosis. Typing these as the literal `false` means a
   * caller cannot store "true" without editing this file, and a reviewer
   * cannot miss the change.
   *
   * REQUIRED BEFORE USE WITH REAL CLIENTS: clinical sign-off on the item set,
   * the scoring, and the band thresholds, plus a validation study. Until then
   * this output is a conversation aid only and is NOT a diagnostic tool.
   */
  bandIsDiagnostic: false;
  /** See `bandIsDiagnostic`. Set as a literal `false` for the same reason. */
  interpretedAsDiagnosis: false;
  /** `null` on a first measurement — not 0, which would read as "no change". */
  change: number | null;
  changeDirection: ChangeDirection;
  /** When A14 ran the scorer. The only non-deterministic field in a result. */
  scoredAt: string;
}

/**
 * A failed submission returns every problem at once. A therapist fixing one
 * error per round-trip on a nine-item form will give up; the alternative —
 * scoring the valid subset — invents a total, which is worse than refusing.
 */
export interface AssessmentError {
  ok: false;
  /** Echoed back when known, `''` when the submission was not an object. */
  clientId: string;
  errors: string[];
}
