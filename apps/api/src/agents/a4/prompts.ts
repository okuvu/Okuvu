import type { A4Input } from './types.js';

export const A4_PROMPT_VERSION = 'a4-activation-v1.0';

/**
 * A4 writes a payload, never a sentence — A12 renders it. The prompt therefore
 * has to produce something A12 can turn into one suggestion without inventing
 * detail, which means the action must be self-contained and already small.
 */
export function buildBehaviouralActivationPrompt(input: A4Input): string {
  const history = (input.recentHistory ?? [])
    .map((turn) => `${turn.role === 'assistant' ? 'Okuvu' : 'Client'}: ${turn.content}`)
    .join('\n');

  return [
    'You are A4, the Behavioural Activation Agent inside Okuvu, a mental-health support product.',
    'Your job: propose ONE small, concrete, real-world action the client could start today, and say why it follows from what they said.',
    '',
    'Hard rules — violating any one of them makes your entire output unusable:',
    '1. `action` is one doable behaviour, verb-first, under 20 words. It must be specific enough that the client knows exactly what to do and when to start: "message Priya to ask about the Saturday walk", not "be more social".',
    '2. Never propose an action that only exists as a mood target ("try to be happier", "think positive", "be more social", "cheer up"). A mood is not a behaviour.',
    '3. Do not scale the action to the client\'s ambition. Choose the smallest version — ten minutes, one message, one room. A larger plan that is not started is a failure of this agent.',
    '4. `when` is the client\'s own time framing ("after dinner", "before work on Thursday") or null. Never a clinic-style schedule.',
    '5. `rationale` is one clause that connects the action to something the client actually said. Do not argue, do not promise an outcome, do not mention diagnosis or medication.',
    '6. `predicted_difficulty` is an integer 0–10: how hard the client would find it, not how hard it should be. No decimals, no ranges.',
    '7. Never address the client in the second person with instructions ("you should", "you need to"). Describe the action; A12 decides how to offer it.',
    '',
    `Safety state for this turn: ${input.safetyState}. If this state were S3 or S4 you would not be called at all.`,
    '',
    'Return ONLY this JSON object, with no prose before or after:',
    '{',
    '  "action": string,',
    '  "when": string | null,',
    '  "rationale": string,',
    '  "predicted_difficulty": number,',
    '  "confidence": "high" | "medium" | "low"',
    '}',
    '',
    history.length > 0 ? `Recent conversation:\n${history}` : 'No recent conversation is available.',
    '',
    input.userMemoryContext ? `Known context about this client from earlier sessions:\n${input.userMemoryContext}` : 'No prior-session context is available.',
  ].join('\n');
}

interface ActionTemplate {
  match: RegExp;
  action: string;
  when: string;
  rationale: string;
}

/**
 * Canned/sandbox mode never reaches a model, but it must exercise the real
 * parser and the vague-action guard rather than bypass them. Buckets are
 * chosen by keyword in a fixed order so the output is byte-identical for the
 * same message.
 */
const CANNED_TEMPLATES: ReadonlyArray<ActionTemplate> = [
  {
    match: /lonely|alone|isolat|no one|nobody|friends?/i,
    action: 'Send one short message to a friend you have not spoken to this week',
    when: 'before bed tonight',
    rationale: 'Reaching out once is smaller than rebuilding a social life, and it can happen today.',
  },
  {
    match: /work|job|email|deadline|task|behind|stud(y|ies)|assignment/i,
    action: 'Open the task you have been avoiding and work on it for ten minutes',
    when: 'at your desk tomorrow morning',
    rationale: 'Ten minutes of contact with the avoided task is easier to start than finishing it.',
  },
  {
    match: /tired|exhaust|sleep|bed|mornings?|wake/i,
    action: 'Get out of bed within ten minutes of your alarm going off',
    when: 'tomorrow morning',
    rationale: 'One fixed morning step gives the day a start that does not depend on how you feel.',
  },
  {
    match: /walk|outside|park|fresh air|sun|garden/i,
    action: 'Walk outside for ten minutes after your next meal',
    when: 'after your next meal',
    rationale: 'A short walk after eating needs no planning and is over before motivation matters.',
  },
];

const DEFAULT_TEMPLATE: ActionTemplate = {
  match: /.*/,
  action: 'Step outside for a ten-minute walk after your next meal',
  when: 'later today',
  rationale: 'A short walk is small enough to start today without waiting to feel ready.',
};

export function buildCannedA4Json(message: string): string {
  const template = CANNED_TEMPLATES.find((candidate) => candidate.match.test(message)) ?? DEFAULT_TEMPLATE;

  return JSON.stringify({
    action: template.action,
    when: template.when,
    rationale: template.rationale,
    predicted_difficulty: 3,
    confidence: 'medium',
  });
}
