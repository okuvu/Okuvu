import type { A6Input } from './types.js';

export const A6_PROMPT_VERSION = 'a6-meaning-values-v1.0';

/**
 * A6 writes no client-facing prose; A12 renders the payload. So this prompt is
 * not trying to be warm — it is trying to stop the model from doing the one
 * thing values work invites: telling the client what to care about.
 *
 * The `evidence` rule is the load-bearing one. Without it a model happily
 * invents a value from the *topic* ("you mentioned work, so you value
 * achievement") and the client receives a reflection about a person who is
 * not them. Requiring a verbatim quote makes the reflection checkable, and the
 * agent discards the whole payload when the quote is not there.
 */
export function buildMeaningValuesPrompt(input: A6Input): string {
  const sessionLine =
    typeof input.sessionCount === 'number' && Number.isFinite(input.sessionCount)
      ? `Sessions completed so far: ${input.sessionCount}.`
      : 'Sessions completed so far: unknown.';

  return [
    'You are A6, the Meaning & Values Agent inside Okuvu, a mental-health support product.',
    'Your job: notice ONE value that the client\'s own words already point at, and describe one small step in that direction.',
    '',
    'Hard rules — violating any one of them makes your entire output unusable:',
    '1. `evidence` MUST be a verbatim substring of the client\'s message. Do not rephrase, tidy, translate, or merge two of their sentences.',
    '2. `value` is a short noun phrase for what the client appears to care about ("being there for my sister", "honesty", "work that helps someone"). It describes, it does not instruct.',
    '3. Never moralise. Do not tell the client what they should value, do not call anything "the right thing to do", do not describe what "good people" do, and do not tell them what they must believe. The client is the only authority on their values; you may only reflect what they already said.',
    '4. `next_step` is one small, concrete thing that could happen this week — not a life plan, not a goal stack, at most one sentence.',
    '5. Never diagnose, never mention medication, never promise an outcome.',
    '6. If the message carries no discernible value signal, return your best single candidate rather than an invented quote. Leave `evidence` empty and your payload will be discarded — nothing is better than a value imposed on someone.',
    '',
    `Safety state for this turn: ${input.safetyState}. If this state were S3 or S4 you would not be called at all.`,
    sessionLine,
    'Write all human-readable fields in the language the client used, matching their register.',
    '',
    'Return ONLY this JSON object, with no prose before or after:',
    '{',
    '  "value": string,',
    '  "evidence": string,',
    '  "next_step": string,',
    '  "confidence": "high" | "medium" | "low"',
    '}',
    '',
    input.userMemoryContext
      ? `Known context about this client from earlier sessions:\n${input.userMemoryContext}`
      : 'No prior-session context is available.',
  ].join('\n');
}

/** Values a deterministic sandbox reply can point at, keyed off the message. */
const CANNED_VALUES: ReadonlyArray<{ pattern: RegExp; value: string }> = [
  { pattern: /family|mum|mother|dad|father|sister|brother|son|daughter|kids|children/i, value: 'showing up for family' },
  { pattern: /friend|people|lonely|alone|isolat/i, value: 'connection' },
  { pattern: /work|job|career|study|uni|school|colleague/i, value: 'contributing through work' },
  { pattern: /honest|truth|lied|lying/i, value: 'honesty' },
  { pattern: /kind|help|look after|caring/i, value: 'looking after others' },
];

export const CANNED_DEFAULT_VALUE = 'looking after myself';

/**
 * Sandbox/canned mode. Deterministic, and deliberately shaped like a real
 * parse path: the evidence is a verbatim prefix of the message, so the
 * grounding guard is exercised rather than bypassed.
 */
export function buildCannedA6Json(message: string): string {
  const lower = message.toLowerCase();
  const value = CANNED_VALUES.find((entry) => entry.pattern.test(lower))?.value ?? CANNED_DEFAULT_VALUE;

  const firstSentence = message.trim().split(/(?<=[.!?])\s/)[0]?.trim() ?? message.trim();

  return JSON.stringify({
    value,
    evidence: firstSentence.slice(0, 240),
    next_step: `Honour ${value} in one small way this week — ten minutes is enough.`,
    confidence: 'medium',
  });
}
