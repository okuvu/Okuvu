import type { A11Output, LearningAggregate, SessionSignal } from './types.js';

/**
 * A11 is deterministic arithmetic over session signals. It deliberately does
 * not import the LLM path: an aggregate that changes because a model felt
 * different on Tuesday is not a measurement, and a caseload-level statistic
 * cannot be regression-tested against a schema. Every number here is
 * reproducible from the input alone.
 */

export const DEFAULT_MIN_SAMPLE = 5;

interface Bucket {
  sum: number;
  n: number;
  adhered: number;
}

/**
 * Code-unit ordering, not `localeCompare` — the latter varies with the ICU
 * build and the host locale, which would make the output ordering depend on
 * where it ran.
 */
function compareSpecialistId(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Means are rounded so a client-side formatter never renders 0.30000000000000004. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function resolveMinSample(requested: number | undefined): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested < 1) {
    return DEFAULT_MIN_SAMPLE;
  }
  return Math.floor(requested);
}

/**
 * Suppression rule: below `minSample`, `meanDelta` and `adherenceRate` are
 * null rather than computed-and-hidden. A number that exists in the payload is
 * a number that will eventually be rendered, sorted, or exported — two
 * sessions must never become a published average.
 */
export function aggregateLearning(signals: SessionSignal[], opts?: { minSample?: number }): A11Output {
  const minSample = resolveMinSample(opts?.minSample);
  const list = Array.isArray(signals) ? signals : [];

  const buckets = new Map<string, Bucket>();
  const notes: string[] = [];

  const totalSessions = list.length;
  let excludedNonFinite = 0;
  let excludedInvalid = 0;

  for (const signal of list) {
    if (signal === null || typeof signal !== 'object') {
      excludedInvalid += 1;
      continue;
    }

    // NaN and ±Infinity are usually a missing measurement that was mapped to a
    // number. Averaging one silently poisons the whole caseload figure, so the
    // signal is dropped and the drop is reported.
    if (typeof signal.outcomeDelta !== 'number' || !Number.isFinite(signal.outcomeDelta)) {
      excludedNonFinite += 1;
      continue;
    }

    if (typeof signal.specialistId !== 'string' || signal.specialistId.trim() === '') {
      excludedInvalid += 1;
      continue;
    }

    const key = signal.specialistId;
    const bucket = buckets.get(key) ?? { sum: 0, n: 0, adhered: 0 };
    bucket.sum += signal.outcomeDelta;
    bucket.n += 1;
    if (signal.adheredToPlan === true) bucket.adhered += 1;
    buckets.set(key, bucket);
  }

  if (excludedNonFinite > 0) notes.push(`excluded_non_finite_delta:${excludedNonFinite}`);
  if (excludedInvalid > 0) notes.push(`excluded_invalid_signal:${excludedInvalid}`);

  const aggregates: LearningAggregate[] = [];

  for (const specialistId of [...buckets.keys()].sort(compareSpecialistId)) {
    const bucket = buckets.get(specialistId);
    if (bucket === undefined) continue;

    const suppressed = bucket.n < minSample;

    if (suppressed) {
      notes.push(`suppressed_below_min_sample:${specialistId}:${bucket.n}<${minSample}`);
      aggregates.push({
        specialistId,
        n: bucket.n,
        meanDelta: null,
        adherenceRate: null,
        suppressed: true,
      });
      continue;
    }

    aggregates.push({
      specialistId,
      n: bucket.n,
      meanDelta: round4(bucket.sum / bucket.n),
      adherenceRate: round4(bucket.adhered / bucket.n),
      suppressed: false,
    });
  }

  return { aggregates, minSample, totalSessions, notes };
}
