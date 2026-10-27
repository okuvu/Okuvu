import { callJson, isEnum } from '../shared/json-call.js';
import {
  emptySpecialistOutput,
  isSafetyBlocked,
  isGroundedInMessage,
  findForbiddenAdvice,
  MAX_PAYLOAD_ITEM_CHARS,
  MAX_PAYLOAD_FIELD_CHARS,
} from '../shared/specialist.js';
import type { InterpersonalSkill, InterpersonalSkillsPayload } from '../shared/types.js';
import { buildInterpersonalSkillsPrompt, buildCannedA5Json } from './prompts.js';
import type { A5Input, A5Output } from './types.js';

const VALID_SKILLS: ReadonlySet<string> = new Set<InterpersonalSkill>([
  'boundary_setting',
  'repair',
  'asking_for_help',
  'refusing',
  'asserting_a_need',
]);

const VALID_CONFIDENCE: ReadonlySet<string> = new Set(['high', 'medium', 'low']);

const A5_SCHEMA = {
  type: 'OBJECT' as const,
  properties: {
    skill: { type: 'STRING' as const },
    situation: { type: 'STRING' as const },
    example_words: { type: 'STRING' as const },
    purpose: { type: 'STRING' as const },
    confidence: { type: 'STRING' as const },
  },
  required: ['skill', 'situation', 'example_words', 'purpose', 'confidence'],
};

/**
 * Second-person direction in `example_words` means the model wrote advice for
 * the client instead of a line the client could say — the one failure mode
 * that turns a script into an instruction.
 */
const SECOND_PERSON_INSTRUCTION = /\byou\s+(should|must|need to|have to|ought to|had better|better)\b/i;

export function findSecondPersonInstruction(text: string): string | null {
  const match = SECOND_PERSON_INSTRUCTION.exec(text);
  return match === null ? null : match[0].toLowerCase();
}

/** Non-empty, trimmed, and rejected rather than silently truncated above the cap. */
function boundedText(value: unknown, maxChars: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0 || trimmed.length > maxChars) return null;
  return trimmed;
}

function parseA5(parsed: Record<string, unknown>, message: string): InterpersonalSkillsPayload | null {
  if (!isEnum<InterpersonalSkill>(parsed.skill, VALID_SKILLS)) return null;

  const situation = boundedText(parsed.situation, MAX_PAYLOAD_FIELD_CHARS);
  if (situation === null) return null;
  // A skill applied to a relationship the client never described is advice
  // about a stranger, so the situation must be their own framing verbatim.
  if (!isGroundedInMessage(situation, message)) return null;

  const exampleWords = boundedText(parsed.example_words, MAX_PAYLOAD_ITEM_CHARS);
  if (exampleWords === null) return null;
  if (findSecondPersonInstruction(exampleWords) !== null) return null;

  const purpose = boundedText(parsed.purpose, MAX_PAYLOAD_FIELD_CHARS);
  if (purpose === null) return null;

  if (!isEnum<'high' | 'medium' | 'low'>(parsed.confidence, VALID_CONFIDENCE)) return null;

  const surface = [situation, exampleWords, purpose].join(' \n ');
  if (findForbiddenAdvice(surface) !== null) return null;

  return {
    type: 'interpersonal_skills',
    skill: parsed.skill,
    situation,
    example_words: exampleWords,
    purpose,
    confidence: parsed.confidence,
  };
}

export async function planInterpersonalSkill(input: A5Input): Promise<A5Output> {
  // A8 should never select A5 at S3/S4; this guard makes that independent of A8.
  if (isSafetyBlocked(input.safetyState)) {
    return emptySpecialistOutput<InterpersonalSkillsPayload>('A5', `refused_safety_state_${input.safetyState}`);
  }

  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  for (const turn of input.recentHistory ?? []) {
    contents.push({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    });
  }
  contents.push({ role: 'user', parts: [{ text: input.message }] });

  const result = await callJson<InterpersonalSkillsPayload | null>({
    agent: 'A5',
    systemInstruction: buildInterpersonalSkillsPrompt(input),
    contents,
    schema: A5_SCHEMA,
    required: ['skill', 'situation', 'example_words', 'purpose', 'confidence'],
    cannedResponse: buildCannedA5Json(input.message),
    temperature: 0,
    validate: (parsed) => parseA5(parsed, input.message),
    onFailure: () => null,
  });

  if (result.value === null) {
    return emptySpecialistOutput<InterpersonalSkillsPayload>('A5', result.failureReason ?? 'contract_rejected');
  }

  return {
    agentId: 'A5',
    payload: result.value,
    fallbackUsed: false,
    failureReason: null,
    notes: null,
  };
}
