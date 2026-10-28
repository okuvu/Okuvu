/**
 * A14 scoring — pure, synchronous, no model call, no I/O.
 *
 * Everything in this file is total: `scoreAssessment` returns a result or an
 * error value and never throws, never returns a partial score, and never
 * fills a missing item with a default. A wrong number that looks plausible is
 * the worst possible output of a measurement agent.
 */

import type {
  AssessmentBand,
  AssessmentError,
  AssessmentItem,
  AssessmentResult,
  AssessmentSubmission,
  ChangeDirection,
  PreviousAssessment,
} from './types.js';

export const INSTRUMENT_ID = 'okuvu-wellbeing-9' as const;

/** Nine items, each 0–3. Kept as constants so tests can assert the arithmetic. */
export const INSTRUMENT_ITEM_COUNT = 9;
export const INSTRUMENT_MIN_SCORE = 0;
export const INSTRUMENT_MAX_ITEM_SCORE = 3;
export const INSTRUMENT_MAX_SCORE = 27 as const;

/**
 * Band thresholds (inclusive upper bounds of each band):
 *
 *   0–4   minimal
 *   5–9   mild
 *  10–14  moderate
 *  15–27  high
 *
 * These are routing thresholds, not clinical cut-offs. They are tested at
 * 4/5, 9/10 and 14/15 so an edit that shifts a boundary fails loudly.
 */
export const BAND_THRESHOLDS = {
  minimalMax: 4,
  mildMax: 9,
  moderateMax: 14,
} as const;

/**
 * |change| <= 2 is treated as measurement noise. A nine-item 0–3 instrument
 * moves by a point or two on a bad night; calling that "worsening" trains
 * clients to distrust the number and the therapist to ignore the alert.
 */
export const STABLE_CHANGE_THRESHOLD = 2;

export function bandForTotal(total: number): AssessmentBand {
  if (total <= BAND_THRESHOLDS.minimalMax) return 'minimal';
  if (total <= BAND_THRESHOLDS.mildMax) return 'mild';
  if (total <= BAND_THRESHOLDS.moderateMax) return 'moderate';
  return 'high';
}

/**
 * `direction` is read from the change, never from the band. Moving from
 * "high" to "moderate" is improvement even though the band name got shorter,
 * and moving 16 → 18 is worsening inside the same band.
 */
export function directionForChange(change: number | null): ChangeDirection {
  if (change === null) return 'first_measure';
  if (Math.abs(change) <= STABLE_CHANGE_THRESHOLD) return 'stable';
  // A fall in score is improvement.
  return change < 0 ? 'improving' : 'worsening';
}

function isScore(value: unknown): value is 0 | 1 | 2 | 3 {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= INSTRUMENT_MIN_SCORE &&
    value <= INSTRUMENT_MAX_ITEM_SCORE
  );
}

function isTotalScore(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= INSTRUMENT_MIN_SCORE &&
    value <= INSTRUMENT_MAX_SCORE
  );
}

/**
 * Timestamps must carry an explicit timezone. A bare `2026-03-04T09:00:00`
 * is ambiguous, and "which day did the score belong to" is the one thing a
 * progress chart cannot get wrong.
 */
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && ISO_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value));
}

/** Renders an offending value for an error message without leaking objects. */
function describeValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Collects every problem in the submission, in a stable order:
 * submission → clientId → instrument → submittedAt → items (by index) →
 * previous. Stable order matters because the errors are shown to a clinician
 * and compared in tests.
 */
function collectErrors(rawSubmission: unknown, rawPrevious: unknown): string[] {
  const errors: string[] = [];

  if (!isRecord(rawSubmission)) {
    errors.push(`submission: must be an object, received ${describeValue(rawSubmission)}`);
    return errors;
  }

  const submission = rawSubmission;

  if (typeof submission.clientId !== 'string' || submission.clientId.trim().length === 0) {
    errors.push(`clientId: must be a non-empty string, received ${describeValue(submission.clientId)}`);
  }

  if (submission.instrument !== INSTRUMENT_ID) {
    errors.push(
      `instrument: must be ${JSON.stringify(INSTRUMENT_ID)}, received ${describeValue(submission.instrument)}`,
    );
  }

  if (!isIsoTimestamp(submission.submittedAt)) {
    errors.push(
      `submittedAt: must be an ISO-8601 timestamp with a timezone, received ${describeValue(submission.submittedAt)}`,
    );
  }

  const rawItems = submission.items;

  if (!Array.isArray(rawItems)) {
    errors.push(`items: must be an array, received ${describeValue(rawItems)}`);
  } else {
    if (rawItems.length !== INSTRUMENT_ITEM_COUNT) {
      errors.push(
        `items: expected exactly ${INSTRUMENT_ITEM_COUNT}, received ${rawItems.length}`,
      );
    }

    const seenIds = new Map<string, number>();

    rawItems.forEach((rawItem: unknown, index: number) => {
      const at = `items[${index}]`;

      if (!isRecord(rawItem)) {
        errors.push(`${at}: must be an object, received ${describeValue(rawItem)}`);
        return;
      }

      if (typeof rawItem.id !== 'string' || rawItem.id.trim().length === 0) {
        errors.push(`${at}.id: must be a non-empty string, received ${describeValue(rawItem.id)}`);
      } else {
        const firstIndex = seenIds.get(rawItem.id);
        if (firstIndex !== undefined) {
          errors.push(
            `${at}.id: duplicate id ${JSON.stringify(rawItem.id)}, first used at items[${firstIndex}]`,
          );
        } else {
          seenIds.set(rawItem.id, index);
        }
      }

      if (!isScore(rawItem.score)) {
        errors.push(
          `${at}.score: must be an integer 0-3, received ${describeValue(rawItem.score)}`,
        );
      }
    });
  }

  // `null` means "no previous measurement" — the database returns null for a
  // first session, and forcing callers to convert it invites a `?? 0` that
  // would silently read as a 0 → total change on every first assessment.
  if (rawPrevious !== undefined && rawPrevious !== null) {
    if (!isRecord(rawPrevious)) {
      errors.push(`previous: must be an object, received ${describeValue(rawPrevious)}`);
    } else {
      if (!isTotalScore(rawPrevious.total)) {
        errors.push(
          `previous.total: must be an integer 0-${INSTRUMENT_MAX_SCORE}, received ${describeValue(rawPrevious.total)}`,
        );
      }
      if (!isIsoTimestamp(rawPrevious.submittedAt)) {
        errors.push(
          `previous.submittedAt: must be an ISO-8601 timestamp with a timezone, received ${describeValue(rawPrevious.submittedAt)}`,
        );
      }
    }
  }

  return errors;
}

/**
 * Scores one submission.
 *
 * On any invalid input this returns `{ ok: false, errors }` listing *every*
 * problem found, and never a partially scored result. It never throws, so a
 * caller does not need a try/catch to stay safe, and it never treats a
 * missing item as zero.
 */
export function scoreAssessment(
  submission: AssessmentSubmission,
  previous?: PreviousAssessment | null,
): AssessmentResult | AssessmentError {
  const errors = collectErrors(submission, previous);

  const candidate = isRecord(submission) ? submission : null;
  const clientId = typeof candidate?.clientId === 'string' ? candidate.clientId : '';

  if (errors.length > 0) {
    return { ok: false, clientId, errors };
  }

  const items = (candidate as unknown as { items: AssessmentItem[] }).items;
  const total = items.reduce((sum, item) => sum + item.score, 0);

  const priorTotal = previous !== undefined && previous !== null ? previous.total : null;
  const change = priorTotal === null ? null : total - priorTotal;

  return {
    ok: true,
    clientId,
    instrument: INSTRUMENT_ID,
    total,
    maxScore: INSTRUMENT_MAX_SCORE,
    band: bandForTotal(total),
    // Literals on purpose — see the comment on AssessmentResult.
    bandIsDiagnostic: false,
    interpretedAsDiagnosis: false,
    change,
    changeDirection: directionForChange(change),
    // The one non-deterministic field: when the score was computed, as opposed
    // to when the client submitted it. Kept separate because a submission
    // scored late (offline queue, retry) must not claim to have been scored at
    // submission time.
    scoredAt: new Date().toISOString(),
  };
}
