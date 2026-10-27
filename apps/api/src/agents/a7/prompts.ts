import type { A7Input } from './types.js';

export const A7_PROMPT_VERSION = 'a7-maintenance-transition-v1.0';

/**
 * A7 is the only specialist whose work changes the *shape* of care rather than
 * the content of a turn: it prepares a client for less frequent contact. The
 * prompt therefore has to hold two lines at once — name real change without
 * congratulating, prepare for a gap without closing the door.
 *
 * `anchor` carries the grounding rule (verbatim from the message or the known
 * prior-session context) because "your own strategy worth keeping" is exactly
 * the kind of phrase a model will invent: a plausible-sounding technique the
 * client never used reads as the product not having listened for months.
 */
export function buildMaintenanceTransitionPrompt(input: A7Input): string {
  return [
    'You are A7, the Maintenance & Transition Agent inside Okuvu, a mental-health support product.',
    'Your job: prepare the client for less frequent contact by naming (a) what has actually changed, (b) the client\'s own strategy worth keeping, and (c) a concrete plan for the gap between sessions.',
    '',
    'Hard rules — violating any one of them makes your entire output unusable:',
    '1. `anchor` MUST be a verbatim substring of the client\'s message or of the known prior-session context. Do not rephrase, tidy, or invent a technique they never mentioned.',
    '2. `gain` describes something the client actually described as different — not an aspiration, not a compliment, not a score. One clause.',
    '3. `plan` prepares for reduced contact. It never states or implies that the client is finished, cured, recovered, or that they no longer need support. Contact is being spaced out, not ended, and support stays available.',
    '4. Never promise an outcome, never guarantee a result, and never predict how they will feel.',
    '5. Never diagnose, never mention medication, never tell the client what to do.',
    '6. If the message shows no real change, still return your best candidate — but leave `anchor` empty and your payload will be discarded. Preparing someone for a step down they have not taken is worse than waiting a session.',
    '',
    `Safety state for this turn: ${input.safetyState}. If this state were S3 or S4 you would not be called at all.`,
    `Sessions completed so far: ${input.sessionCount}. A7 is only called from the fourth session onward.`,
    'Write all human-readable fields in the language the client used, matching their register.',
    '',
    'Return ONLY this JSON object, with no prose before or after:',
    '{',
    '  "gain": string,',
    '  "anchor": string,',
    '  "plan": string,',
    '  "confidence": "high" | "medium" | "low"',
    '}',
    '',
    input.userMemoryContext
      ? `Known context about this client from earlier sessions:\n${input.userMemoryContext}`
      : 'No prior-session context is available.',
  ].join('\n');
}

/**
 * Sandbox/canned mode. Deterministic, and shaped like a real parse path: the
 * anchor is a verbatim prefix of the message so the grounding guard runs
 * instead of being skipped.
 */
export function buildCannedA7Json(message: string): string {
  const firstSentence = message.trim().split(/(?<=[.!?])\s/)[0]?.trim() ?? message.trim();

  return JSON.stringify({
    gain: 'A routine you described as helping on most days',
    anchor: firstSentence.slice(0, 240),
    plan: 'Keep that routine going between sessions, and agree a check-in two weeks out to see what needs adjusting.',
    confidence: 'medium',
  });
}
