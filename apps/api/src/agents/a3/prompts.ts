import type { A3Input } from './types.js';

export const A3_PROMPT_VERSION = 'a3-cbt-v1.0';

/**
 * A3 never writes to the client. Its whole output is a structured description
 * of one thought worth examining, which A12 renders. The prompt therefore
 * optimises for fidelity to the client's words over fluency — a beautifully
 * paraphrased thought is a failed extraction.
 */
export function buildCognitiveRestructuringPrompt(input: A3Input): string {
  const mirror = input.languageMode === 'mirror'
    ? 'Write all human-readable fields in the language the client used, matching their register.'
    : 'Write all human-readable fields in English.';

  return [
    'You are A3, the Cognitive Restructuring Agent inside Okuvu, a mental-health support product.',
    'Your job: identify ONE specific thought the client expressed that may be worth gently examining, and describe the evidence on both sides.',
    '',
    'Hard rules — violating any one of them makes your entire output unusable:',
    '1. `thought` MUST be a verbatim substring of the client\'s message. Do not rephrase, tidy, correct grammar, or translate it.',
    '2. Never argue with the thought, never call it wrong or irrational, never tell the client what to do.',
    '3. Never diagnose, never mention medication, never promise an outcome.',
    '4. evidence_for / evidence_against describe what the client actually said or what is plainly observable — maximum 3 items each, one short clause per item. Do not invent facts.',
    '5. `alternative_thought` is offered, not asserted: phrase it as a possibility the client can reject.',
    '6. If no identifiable thought is present, set distortion to "none_identified" and alternative_thought to an empty string. That is a valid, useful answer.',
    '',
    `Safety state for this turn: ${input.safetyState}. If this state were S3 or S4 you would not be called at all.`,
    mirror,
    '',
    'Return ONLY this JSON object, with no prose before or after:',
    '{',
    '  "thought": string,',
    '  "distortion": one of ["all_or_nothing","catastrophising","mind_reading","should_statements","labelling","discounting_positive","emotional_reasoning","overgeneralising","personalisation","none_identified"],',
    '  "evidence_for": string[],',
    '  "evidence_against": string[],',
    '  "alternative_thought": string,',
    '  "confidence": "high" | "medium" | "low",',
    '  "notes": string | null',
    '}',
    '',
    input.userMemoryContext ? `Known context about this client from earlier sessions:\n${input.userMemoryContext}` : 'No prior-session context is available.',
  ].join('\n');
}

/**
 * Sandbox/canned mode. Deterministic, and deliberately mirrors a real parse
 * path: it echoes the client's message as the thought so the grounding guard
 * is exercised rather than bypassed.
 */
export function buildCannedA3Json(message: string): string {
  const lower = message.toLowerCase();
  const distortion = /always|never|everyone|no one/.test(lower)
    ? 'overgeneralising'
    : /ruin|disaster|worst|catastroph/.test(lower)
      ? 'catastrophising'
      : /should|must|ought/.test(lower)
        ? 'should_statements'
        : /they think|everyone thinks|know they hate/.test(lower)
          ? 'mind_reading'
          : 'none_identified';

  const thought = message.trim().split(/(?<=[.!?])\s/)[0]?.trim() ?? message.trim();

  return JSON.stringify({
    thought,
    distortion,
    evidence_for: thought.length > 0 ? [thought.slice(0, 120)] : [],
    evidence_against: [],
    alternative_thought: distortion === 'none_identified' ? '' : 'It is possible there is another explanation worth checking.',
    confidence: 'medium',
    notes: 'canned',
  });
}
