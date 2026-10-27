import { callJson, isEnum, asTrimmedString, asStringList, asOptionalTrimmedString } from '../shared/json-call.js';
import {
  emptySpecialistOutput,
  isSafetyBlocked,
  isGroundedInMessage,
  findForbiddenAdvice,
  MAX_PAYLOAD_ITEMS,
  MAX_PAYLOAD_ITEM_CHARS,
  MAX_PAYLOAD_FIELD_CHARS,
} from '../shared/specialist.js';
import type { DistortionType, CognitiveRestructuringPayload } from '../shared/types.js';
import { buildCognitiveRestructuringPrompt, buildCannedA3Json } from './prompts.js';
import type { A3Input, A3Output } from './types.js';

const VALID_DISTORTIONS: ReadonlySet<string> = new Set<DistortionType>([
  'all_or_nothing',
  'catastrophising',
  'mind_reading',
  'should_statements',
  'labelling',
  'discounting_positive',
  'emotional_reasoning',
  'overgeneralising',
  'personalisation',
  'none_identified',
]);

const VALID_CONFIDENCE: ReadonlySet<string> = new Set(['high', 'medium', 'low']);

const A3_SCHEMA = {
  type: 'OBJECT' as const,
  properties: {
    thought: { type: 'STRING' as const },
    distortion: { type: 'STRING' as const },
    evidence_for: { type: 'ARRAY' as const, items: { type: 'STRING' as const } },
    evidence_against: { type: 'ARRAY' as const, items: { type: 'STRING' as const } },
    alternative_thought: { type: 'STRING' as const },
    confidence: { type: 'STRING' as const },
    notes: { type: 'STRING' as const, nullable: true },
  },
  required: ['thought', 'distortion', 'evidence_for', 'evidence_against', 'alternative_thought', 'confidence'],
};

/**
 * Extraction guard chain. Order matters: the grounding check runs on `thought`
 * before anything else is trusted, because every downstream field is anchored
 * to that quote. A payload whose quote the client never said is discarded
 * wholesale rather than repaired — a reflection the client does not recognise
 * costs more alliance than a missed technique.
 */
function parseA3(parsed: Record<string, unknown>, message: string): CognitiveRestructuringPayload | null {
  const thought = asTrimmedString(parsed.thought, MAX_PAYLOAD_FIELD_CHARS);
  if (thought === null) return null;
  if (!isGroundedInMessage(thought, message)) return null;

  if (!isEnum<DistortionType>(parsed.distortion, VALID_DISTORTIONS)) return null;
  if (!isEnum<'high' | 'medium' | 'low'>(parsed.confidence, VALID_CONFIDENCE)) return null;

  const evidenceFor = asStringList(parsed.evidence_for, MAX_PAYLOAD_ITEMS, MAX_PAYLOAD_ITEM_CHARS);
  const evidenceAgainst = asStringList(parsed.evidence_against, MAX_PAYLOAD_ITEMS, MAX_PAYLOAD_ITEM_CHARS);
  if (evidenceFor === null || evidenceAgainst === null) return null;

  const alternative = asOptionalTrimmedString(parsed.alternative_thought, MAX_PAYLOAD_FIELD_CHARS) ?? '';
  // An empty alternative is only coherent when nothing was identified.
  if (parsed.distortion === 'none_identified' && alternative !== '') return null;
  if (parsed.distortion !== 'none_identified' && alternative === '') return null;

  const surface = [thought, alternative, ...evidenceFor, ...evidenceAgainst].join(' \n ');
  if (findForbiddenAdvice(surface) !== null) return null;

  return {
    type: 'cognitive_restructuring',
    thought,
    distortion: parsed.distortion,
    evidence_for: evidenceFor,
    evidence_against: evidenceAgainst,
    alternative_thought: alternative,
    confidence: parsed.confidence,
  };
}

export async function restructureThought(input: A3Input): Promise<A3Output> {
  if (isSafetyBlocked(input.safetyState)) {
    return emptySpecialistOutput<CognitiveRestructuringPayload>('A3', `refused_safety_state_${input.safetyState}`);
  }

  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  for (const turn of input.recentHistory ?? []) {
    contents.push({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    });
  }
  contents.push({ role: 'user', parts: [{ text: input.message }] });

  const result = await callJson<CognitiveRestructuringPayload | null>({
    agent: 'A3',
    systemInstruction: buildCognitiveRestructuringPrompt(input),
    contents,
    schema: A3_SCHEMA,
    required: ['thought', 'distortion', 'evidence_for', 'evidence_against', 'alternative_thought', 'confidence'],
    cannedResponse: buildCannedA3Json(input.message),
    validate: (parsed) => parseA3(parsed, input.message),
    onFailure: () => null,
  });

  if (result.value === null) {
    return emptySpecialistOutput<CognitiveRestructuringPayload>('A3', result.failureReason ?? 'contract_rejected');
  }

  return {
    agentId: 'A3',
    payload: result.value,
    fallbackUsed: false,
    failureReason: null,
    notes: null,
  };
}
