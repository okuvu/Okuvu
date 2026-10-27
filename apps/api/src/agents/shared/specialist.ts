import type { SpecialistPayload } from './types.js';

/**
 * Shared shape for the five process specialists (A3–A7).
 *
 * All five obey the same contract, which is why they share a base instead of
 * five near-copies of the same validation:
 *
 *  - they write a *payload*, never user-facing prose. A12 is the only agent
 *    allowed to turn a payload into text (roster rule), so a specialist that
 *    emits a sentence has already broken the architecture.
 *  - they refuse to run at S3/S4. A8 already excludes them, but A8 is one
 *    bug away from not doing that, and a cognitive-restructuring prompt aimed
 *    at someone in crisis is worse than no turn at all.
 *  - on any technical failure they return a null payload, not a plausible
 *    default. An absent intervention is recoverable; an invented one is not.
 */

export interface SpecialistOutput<T extends SpecialistPayload> {
  agentId: string;
  payload: T | null;
  fallbackUsed: boolean;
  failureReason: string | null;
  notes: string | null;
}

/** S3 (high risk) and S4 (crisis) both exclude every process specialist. */
export function isSafetyBlocked(safetyState: string): boolean {
  return safetyState === 'S3' || safetyState === 'S4';
}

export function emptySpecialistOutput<T extends SpecialistPayload>(
  agentId: string,
  reason: string,
): SpecialistOutput<T> {
  return { agentId, payload: null, fallbackUsed: true, failureReason: reason, notes: null };
}

export const MAX_PAYLOAD_ITEMS = 3;
export const MAX_PAYLOAD_ITEM_CHARS = 240;
export const MAX_PAYLOAD_FIELD_CHARS = 400;

/**
 * Phrases that turn a "gentle test of a thought" into advice, a reframe, or a
 * judgement of the client — each of which is an A9-post violation
 * (`direct_advice`, `cognitive_reframe`). Checked at payload level so the
 * problem is caught before text is ever generated, not after.
 */
const FORBIDDEN_ADVICE: ReadonlyArray<{ pattern: RegExp; rule: string }> = [
  { pattern: /\byou (should|must|need to|have to|ought to)\b/i, rule: 'direct_advice' },
  { pattern: /\byou are (wrong|irrational|being silly|overreacting)\b/i, rule: 'cognitive_reframe' },
  { pattern: /\b(that'?s|that is) (wrong|irrational|nonsense|silly)\b/i, rule: 'cognitive_reframe' },
  { pattern: /\b(stop|quit) (worrying|thinking|feeling)\b/i, rule: 'direct_advice' },
  { pattern: /\bjust (relax|calm down|get over it|cheer up)\b/i, rule: 'direct_advice' },
  { pattern: /\b(you always|you never)\b/i, rule: 'cognitive_reframe' },
  { pattern: /\b(diagnos\w+|disorder|prescri\w+|medication)\b/i, rule: 'diagnosis_explicit' },
  { pattern: /\b(i promise|guarantee\w*|will definitely|cure)\b/i, rule: 'outcome_promise' },
];

/** Returns the violation type for the first forbidden phrase found, else null. */
export function findForbiddenAdvice(text: string): string | null {
  for (const { pattern, rule } of FORBIDDEN_ADVICE) {
    if (pattern.test(text)) return rule;
  }
  return null;
}

/**
 * A specialist may only restate words the client actually wrote. Models
 * routinely "tidy" a thought into something the client never said, and a
 * reflection the client does not recognise is a rupture, not a technique.
 * Comparison is whitespace/punctuation-insensitive and case-insensitive.
 */
export function normaliseForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isGroundedInMessage(candidate: string, message: string): boolean {
  const needle = normaliseForComparison(candidate);
  if (needle.length === 0) return false;
  return normaliseForComparison(message).includes(needle);
}

/**
 * Canned/sandbox mode never reaches a model. Each specialist supplies a
 * deterministic fallback so sandbox runs exercise the parser and the guards
 * instead of returning the same "no intervention" for every message.
 */
export function cannedJson(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}
