import type { InterpersonalSkill } from '../shared/types.js';
import type { A5Input } from './types.js';

export const A5_PROMPT_VERSION = 'a5-interpersonal-v1.0';

/**
 * A5 names a skill and the words for it; it never speaks to the client. The
 * prompt anchors `situation` to the client's own phrasing because a skill
 * applied to a relationship the client did not describe is advice about a
 * stranger.
 */
export function buildInterpersonalSkillsPrompt(input: A5Input): string {
  const history = (input.recentHistory ?? [])
    .map((turn) => `${turn.role === 'assistant' ? 'Okuvu' : 'Client'}: ${turn.content}`)
    .join('\n');

  return [
    'You are A5, the Interpersonal Skills Agent inside Okuvu, a mental-health support product.',
    'Your job: identify ONE interpersonal skill that fits this moment, name the situation in the client\'s own words, and give a short example of what they could say.',
    '',
    'Hard rules — violating any one of them makes your entire output unusable:',
    '1. `situation` MUST be a verbatim substring of the client\'s message — the person or relationship as they described it. Do not rephrase, generalise, or name someone they did not name.',
    '2. `skill` is exactly one of: boundary_setting, repair, asking_for_help, refusing, asserting_a_need. Do not invent a sixth.',
    '3. `example_words` is what the CLIENT would say, in the first person, under 40 words. It is a script they can adapt, not an instruction to them. Never write "you should", "you need to", or any second-person direction.',
    '4. Do not script an ultimatum, a threat, or a confrontation. The smallest honest sentence that moves toward the client\'s stated goal wins.',
    '5. `purpose` is one clause saying what the skill is for, tied to the goal the client stated. Never promise that the other person will respond well.',
    '6. Never diagnose, never mention medication, never tell the client what to do, never predict an outcome.',
    '7. If the message contains no interpersonal moment, still choose the closest skill and ground `situation` in the closest thing they actually said. Do not fabricate a relationship.',
    '',
    `Safety state for this turn: ${input.safetyState}. If this state were S3 or S4 you would not be called at all.`,
    '',
    'Return ONLY this JSON object, with no prose before or after:',
    '{',
    '  "skill": "boundary_setting" | "repair" | "asking_for_help" | "refusing" | "asserting_a_need",',
    '  "situation": string,',
    '  "example_words": string,',
    '  "purpose": string,',
    '  "confidence": "high" | "medium" | "low"',
    '}',
    '',
    history.length > 0 ? `Recent conversation:\n${history}` : 'No recent conversation is available.',
    '',
    input.userMemoryContext ? `Known context about this client from earlier sessions:\n${input.userMemoryContext}` : 'No prior-session context is available.',
  ].join('\n');
}

interface SkillTemplate {
  match: RegExp;
  skill: InterpersonalSkill;
  example: string;
  purpose: string;
}

/**
 * Canned/sandbox mode. The situation is cut from the client's own message so
 * the grounding guard is exercised on the sandbox path too, and the example
 * lines are first-person so the second-person guard has something real to
 * check.
 */
const CANNED_TEMPLATES: ReadonlyArray<SkillTemplate> = [
  {
    match: /boundar|overstep|too much|respect|privacy|needs? space/i,
    skill: 'boundary_setting',
    example: 'I care about this, and I need to leave by nine tonight.',
    purpose: 'To keep the relationship workable without absorbing more than you have room for.',
  },
  {
    match: /sorry|apolog|argu|fight|fell out|falling out|said something|snapped/i,
    skill: 'repair',
    example: "I'm sorry I snapped at you yesterday. Can we talk about it?",
    purpose: 'To reopen contact after a rupture without relitigating who was right.',
  },
  {
    match: /need help|ask(ed|ing)? (for|someone|them|him|her|my)|reach out|struggling|on my own|alone/i,
    skill: 'asking_for_help',
    example: "I'm struggling with this and I'd like some help. Is now an okay time?",
    purpose: 'To let someone else carry part of this instead of holding it alone.',
  },
  {
    match: /say no|can'?t do|refus|keeps? asking|asked me to/i,
    skill: 'refusing',
    example: "I can't take on that project this week, but I can look at it next month.",
    purpose: 'To decline one request clearly while leaving the relationship intact.',
  },
];

const DEFAULT_TEMPLATE: SkillTemplate = {
  match: /.*/,
  skill: 'asserting_a_need',
  example: 'I need some quiet time after work before we talk about the day.',
  purpose: 'To state one thing you need without needing the other person to agree first.',
};

function firstClause(message: string): string {
  const sentence = message.trim().split(/(?<=[.!?])\s/)[0]?.trim() ?? message.trim();
  if (sentence.length <= 240) return sentence;
  return sentence.split(/\s+/).slice(0, 6).join(' ');
}

export function buildCannedA5Json(message: string): string {
  const template = CANNED_TEMPLATES.find((candidate) => candidate.match.test(message)) ?? DEFAULT_TEMPLATE;

  return JSON.stringify({
    skill: template.skill,
    situation: firstClause(message),
    example_words: template.example,
    purpose: template.purpose,
    confidence: 'medium',
  });
}
