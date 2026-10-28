import { callJson, isEnum } from '../shared/json-call.js';
import {
  emptySpecialistOutput,
  isSafetyBlocked,
  isGroundedInMessage,
  findForbiddenAdvice,
} from '../shared/specialist.js';
import type { MeaningValuesPayload } from '../shared/types.js';
import { buildMeaningValuesPrompt, buildCannedA6Json } from './prompts.js';
import type { A6Input, A6Output } from './types.js';

const VALID_CONFIDENCE: ReadonlySet<string> = new Set(['high', 'medium', 'low']);

/**
 * `value` and `next_step` are one clause each. 240 matches
 * MAX_PAYLOAD_ITEM_CHARS: the same budget A3 gives a single evidence bullet,
 * which is roughly the longest phrase a client can hold in working memory
 * while A12 reads it back to them.
 */
const MAX_TEXT_CHARS = 240;

/**
 * A6-specific refusal surface, checked on top of the shared
 * `findForbiddenAdvice` list. The shared list catches generic advice ("you
 * should …"); these are the shapes that survive it and still turn a values
 * reflection into a moral instruction — the failure mode this agent exists to
 * avoid, because a client told what to value learns that the product has
 * opinions about who they should be.
 */
const MORALISING = /\b(you should value|the right thing to do|you must believe|good people)\b/i;

const A6_SCHEMA = {
  type: 'OBJECT' as const,
  properties: {
    value: { type: 'STRING' as const },
    evidence: { type: 'STRING' as const },
    next_step: { type: 'STRING' as const },
    confidence: { type: 'STRING' as const },
  },
  required: ['value', 'evidence', 'next_step', 'confidence'],
};

/**
 * Bounded text. Unlike `asTrimmedString` this rejects an over-long field
 * instead of silently truncating it: a 300-character "value" cut to 240 is
 * half a sentence that still reads as a complete clinical statement, and A12
 * has no way to know it was truncated. Fail closed and drop the payload.
 */
function asBoundedText(value: unknown, maxChars: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxChars) return null;
  return trimmed;
}

/**
 * Extraction guard chain. Order matters: evidence is checked for grounding
 * before anything else is trusted, because `value` is only a reading of that
 * quote. If the quote is not in the message, the value is a guess dressed as
 * an observation, and the whole payload is discarded rather than repaired.
 */
function parseA6(parsed: Record<string, unknown>, message: string): MeaningValuesPayload | null {
  const value = asBoundedText(parsed.value, MAX_TEXT_CHARS);
  if (value === null) return null;

  const evidence = asBoundedText(parsed.evidence, MAX_TEXT_CHARS);
  if (evidence === null) return null;
  if (!isGroundedInMessage(evidence, message)) return null;

  const nextStep = asBoundedText(parsed.next_step, MAX_TEXT_CHARS);
  if (nextStep === null) return null;

  if (!isEnum<'high' | 'medium' | 'low'>(parsed.confidence, VALID_CONFIDENCE)) return null;

  const surface = [value, evidence, nextStep].join(' \n ');
  if (findForbiddenAdvice(surface) !== null) return null;
  if (MORALISING.test(surface)) return null;

  return {
    type: 'meaning_values',
    value,
    evidence,
    next_step: nextStep,
    confidence: parsed.confidence,
  };
}

export async function exploreValues(input: A6Input): Promise<A6Output> {
  if (isSafetyBlocked(input.safetyState)) {
    return emptySpecialistOutput<MeaningValuesPayload>('A6', `refused_safety_state_${input.safetyState}`);
  }

  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  for (const turn of input.recentHistory ?? []) {
    contents.push({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    });
  }
  contents.push({ role: 'user', parts: [{ text: input.message }] });

  const result = await callJson<MeaningValuesPayload | null>({
    agent: 'A6',
    systemInstruction: buildMeaningValuesPrompt(input),
    contents,
    schema: A6_SCHEMA,
    required: ['value', 'evidence', 'next_step', 'confidence'],
    cannedResponse: buildCannedA6Json(input.message),
    validate: (parsed) => parseA6(parsed, input.message),
    onFailure: () => null,
  });

  if (result.value === null) {
    return emptySpecialistOutput<MeaningValuesPayload>('A6', result.failureReason ?? 'contract_rejected');
  }

  return {
    agentId: 'A6',
    payload: result.value,
    fallbackUsed: false,
    failureReason: null,
    notes: null,
  };
}
