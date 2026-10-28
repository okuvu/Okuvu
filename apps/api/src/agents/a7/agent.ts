import { callJson, isEnum } from '../shared/json-call.js';
import {
  emptySpecialistOutput,
  isSafetyBlocked,
  isGroundedInMessage,
  findForbiddenAdvice,
  MAX_PAYLOAD_FIELD_CHARS,
} from '../shared/specialist.js';
import type { MaintenanceTransitionPayload } from '../shared/types.js';
import { buildMaintenanceTransitionPrompt, buildCannedA7Json } from './prompts.js';
import type { A7Input, A7Output } from './types.js';

const VALID_CONFIDENCE: ReadonlySet<string> = new Set(['high', 'medium', 'low']);

/**
 * Below this, a transition payload is not a clinical judgement, it is a
 * mistake. Preparing someone for reduced contact in their first sessions tells
 * a person who has just asked for help that the help is winding down — the
 * single most reliable way to lose them. Four sessions is the floor at which
 * there is enough shared history for "what has changed" to mean anything.
 */
export const MIN_SESSIONS_FOR_TRANSITION = 4;

/** An anchor is a quote, so it gets the tighter item budget; gain/plan get a field budget. */
const MAX_ANCHOR_CHARS = 240;

/**
 * Outcome language A7 must never emit. `findForbiddenAdvice` already covers
 * `guarantee` and bare `cure`, but its `\bcure\b` boundary does not match
 * "cured", and nothing in the shared list catches "recovered" or "no longer
 * need" — the three ways a transition message quietly becomes a discharge
 * notice.
 */
const OUTCOME_CLAIM = /\b(cured|recovered|no longer need|guarantee)\b/i;

const A7_SCHEMA = {
  type: 'OBJECT' as const,
  properties: {
    gain: { type: 'STRING' as const },
    anchor: { type: 'STRING' as const },
    plan: { type: 'STRING' as const },
    confidence: { type: 'STRING' as const },
  },
  required: ['gain', 'anchor', 'plan', 'confidence'],
};

/** Rejects over-long fields rather than truncating them into a half-sentence (see A6). */
function asBoundedText(value: unknown, maxChars: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxChars) return null;
  return trimmed;
}

function isGroundedInMessageOrMemory(candidate: string, message: string, memoryContext: string | null | undefined): boolean {
  if (isGroundedInMessage(candidate, message)) return true;
  if (typeof memoryContext !== 'string' || memoryContext.trim().length === 0) return false;
  return isGroundedInMessage(candidate, memoryContext);
}

/**
 * Extraction guard chain. `anchor` is checked for grounding before the rest of
 * the payload is trusted: gain and plan are readings of what has been working,
 * and if the "what has been working" quote does not exist, both readings are
 * about a client who is not in the room. Discard wholesale.
 */
function parseA7(
  parsed: Record<string, unknown>,
  message: string,
  memoryContext: string | null | undefined,
): MaintenanceTransitionPayload | null {
  const gain = asBoundedText(parsed.gain, MAX_PAYLOAD_FIELD_CHARS);
  if (gain === null) return null;

  const anchor = asBoundedText(parsed.anchor, MAX_ANCHOR_CHARS);
  if (anchor === null) return null;
  if (!isGroundedInMessageOrMemory(anchor, message, memoryContext)) return null;

  const plan = asBoundedText(parsed.plan, MAX_PAYLOAD_FIELD_CHARS);
  if (plan === null) return null;

  if (!isEnum<'high' | 'medium' | 'low'>(parsed.confidence, VALID_CONFIDENCE)) return null;

  const surface = [gain, anchor, plan].join(' \n ');
  if (findForbiddenAdvice(surface) !== null) return null;
  if (OUTCOME_CLAIM.test(surface)) return null;

  return {
    type: 'maintenance_transition',
    gain,
    anchor,
    plan,
    confidence: parsed.confidence,
  };
}

export async function prepareTransition(input: A7Input): Promise<A7Output> {
  // Safety first: at S3/S4 nothing else about this turn is worth evaluating,
  // and the caller must be able to tell a safety refusal from a session-count
  // refusal by the reason string alone.
  if (isSafetyBlocked(input.safetyState)) {
    return emptySpecialistOutput<MaintenanceTransitionPayload>('A7', `refused_safety_state_${input.safetyState}`);
  }

  // Fail closed on a missing/garbled count too: `Number.isInteger` rejects
  // undefined-surfaced-as-NaN and fractional values, both of which would
  // otherwise slip past a bare `< 4` comparison (NaN < 4 is false).
  if (!Number.isInteger(input.sessionCount) || input.sessionCount < MIN_SESSIONS_FOR_TRANSITION) {
    return emptySpecialistOutput<MaintenanceTransitionPayload>('A7', 'insufficient_sessions');
  }

  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  for (const turn of input.recentHistory ?? []) {
    contents.push({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    });
  }
  contents.push({ role: 'user', parts: [{ text: input.message }] });

  const result = await callJson<MaintenanceTransitionPayload | null>({
    agent: 'A7',
    systemInstruction: buildMaintenanceTransitionPrompt(input),
    contents,
    schema: A7_SCHEMA,
    required: ['gain', 'anchor', 'plan', 'confidence'],
    cannedResponse: buildCannedA7Json(input.message),
    validate: (parsed) => parseA7(parsed, input.message, input.userMemoryContext),
    onFailure: () => null,
  });

  if (result.value === null) {
    return emptySpecialistOutput<MaintenanceTransitionPayload>('A7', result.failureReason ?? 'contract_rejected');
  }

  return {
    agentId: 'A7',
    payload: result.value,
    fallbackUsed: false,
    failureReason: null,
    notes: null,
  };
}
