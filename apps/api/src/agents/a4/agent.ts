import { callJson, isEnum } from '../shared/json-call.js';
import {
  emptySpecialistOutput,
  isSafetyBlocked,
  findForbiddenAdvice,
  MAX_PAYLOAD_ITEM_CHARS,
  MAX_PAYLOAD_FIELD_CHARS,
} from '../shared/specialist.js';
import type { BehaviouralActivationPayload } from '../shared/types.js';
import { buildBehaviouralActivationPrompt, buildCannedA4Json } from './prompts.js';
import type { A4Input, A4Output } from './types.js';

const VALID_CONFIDENCE: ReadonlySet<string> = new Set(['high', 'medium', 'low']);

const A4_SCHEMA = {
  type: 'OBJECT' as const,
  properties: {
    action: { type: 'STRING' as const },
    when: { type: 'STRING' as const, nullable: true },
    rationale: { type: 'STRING' as const },
    predicted_difficulty: { type: 'NUMBER' as const },
    confidence: { type: 'STRING' as const },
  },
  required: ['action', 'when', 'rationale', 'predicted_difficulty', 'confidence'],
};

/**
 * Mood targets dressed as behaviour. "Try to be happier" cannot be scheduled,
 * so it can never be started today — which is the only thing A4 exists to
 * produce. Kept short and explicit rather than clever: a broad regex here
 * would start rejecting legitimate small actions.
 */
const VAGUE_ACTION_PATTERNS: ReadonlyArray<RegExp> = [
  /\btry to be (happier|happy|more positive|more social|more active|better)\b/i,
  /\bthink positive(ly)?\b/i,
  /\bbe (more )?(social|positive|happy|active|productive)\b/i,
  /\b(cheer up|stay positive|be kinder to yourself)\b/i,
  /\bget out more\b/i,
  /\bimprove (your|my) mood\b/i,
  /\bdo something (nice|fun)\b/i,
  /\bmake an effort\b/i,
  /\btake care of yourself\b/i,
];

export function isVagueAction(action: string): boolean {
  return VAGUE_ACTION_PATTERNS.some((pattern) => pattern.test(action));
}

/** `undefined` means the field was present but malformed; `null` is a valid absence. */
function parseWhen(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) return null;
  return trimmed.length <= MAX_PAYLOAD_ITEM_CHARS ? trimmed : undefined;
}

/** Non-empty, trimmed, and rejected rather than silently truncated above the cap. */
function boundedText(value: unknown, maxChars: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0 || trimmed.length > maxChars) return null;
  return trimmed;
}

function parseA4(parsed: Record<string, unknown>): BehaviouralActivationPayload | null {
  const action = boundedText(parsed.action, MAX_PAYLOAD_ITEM_CHARS);
  if (action === null) return null;
  // A vague action is not repairable downstream: A12 would have to invent the
  // specific detail, and inventing is exactly what A12 is forbidden to do.
  if (isVagueAction(action)) return null;

  const when = parseWhen(parsed.when);
  if (when === undefined) return null;

  const rationale = boundedText(parsed.rationale, MAX_PAYLOAD_FIELD_CHARS);
  if (rationale === null) return null;

  const difficulty = parsed.predicted_difficulty;
  // Integers only: a float reads as a measurement, and 0–10 is a self-rating,
  // not a clinical score.
  if (typeof difficulty !== 'number' || !Number.isInteger(difficulty) || difficulty < 0 || difficulty > 10) {
    return null;
  }

  if (!isEnum<'high' | 'medium' | 'low'>(parsed.confidence, VALID_CONFIDENCE)) return null;

  const surface = [action, when ?? '', rationale].join(' \n ');
  if (findForbiddenAdvice(surface) !== null) return null;

  return {
    type: 'behavioural_activation',
    action,
    when,
    rationale,
    predicted_difficulty: difficulty,
    confidence: parsed.confidence,
  };
}

export async function buildActivationPlan(input: A4Input): Promise<A4Output> {
  // A8 should never select A4 at S3/S4; this guard makes that independent of A8.
  if (isSafetyBlocked(input.safetyState)) {
    return emptySpecialistOutput<BehaviouralActivationPayload>('A4', `refused_safety_state_${input.safetyState}`);
  }

  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  for (const turn of input.recentHistory ?? []) {
    contents.push({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    });
  }
  contents.push({ role: 'user', parts: [{ text: input.message }] });

  const result = await callJson<BehaviouralActivationPayload | null>({
    agent: 'A4',
    systemInstruction: buildBehaviouralActivationPrompt(input),
    contents,
    schema: A4_SCHEMA,
    required: ['action', 'when', 'rationale', 'predicted_difficulty', 'confidence'],
    cannedResponse: buildCannedA4Json(input.message),
    temperature: 0,
    validate: parseA4,
    onFailure: () => null,
  });

  if (result.value === null) {
    return emptySpecialistOutput<BehaviouralActivationPayload>('A4', result.failureReason ?? 'contract_rejected');
  }

  return {
    agentId: 'A4',
    payload: result.value,
    fallbackUsed: false,
    failureReason: null,
    notes: null,
  };
}
