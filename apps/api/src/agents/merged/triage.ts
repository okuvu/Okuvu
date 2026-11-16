import type { SafetyState } from '@okuvu/shared-types';
import { generateContent } from '../../lib/generate-content.js';
import { buildTriagePrompt } from './prompts.js';
import { hasCrisisLanguage } from '../a1/crisis-keywords.js';
import type { A1Basis, A1Input, A1Output, A1SignalStrength } from '../a1/types.js';
import type {
  GovernanceConfidence,
  GovernanceOutput,
  GovernanceReasonCode,
  GovernanceState,
} from '../a9/types.js';

/**
 * One call answering A1's safety question and A9-pre's governance question
 * (E17-S6).
 *
 * ## Why this exists, and what it does not buy
 *
 * The two classifiers ran as two calls with two prompts on every turn. They were
 * already concurrent (`Promise.allSettled` in the orchestrator), so merging them
 * does not shorten the turn. It removes one request, one duplicated message and
 * one place for the two answers to disagree.
 *
 * It does **not** save prompt tokens, and any plan that assumes it does is
 * wrong: measured on the shipped prompt files, the two prompts share 0.6% of
 * their content. The pair costs ~5.7k tokens and the union costs ~5.7k. The
 * only way to make merging cheaper is to delete rules from a clinically
 * approved prompt, which is a clinical decision, not an engineering one.
 *
 * ## Why it is behind a flag and off by default
 *
 * This is new safety-critical prompt text — A1's approved rubric now hands its
 * decision to a model that has also read governance policy, and vice versa. It
 * must be scored against the same gold set as the split path before it becomes
 * the production classifier (`OKUVU_MERGED_TRIAGE=true` opts in), and the
 * union's clinical sign-off is Shubhangi's, per `docs/00a-clinical-authority.md`.
 *
 * ## Fail-closed behaviour
 *
 * Identical to the two agents it replaces, field by field:
 *
 *  • safety:  technical failure / unparseable → S4 when the deterministic crisis
 *    screen matches, otherwise S2 (never S0);
 *  • governance: technical failure / unparseable → Restricted (never Active,
 *    never a technical-failure Blocked).
 *
 * A partial parse is honoured per field group: a valid safety block with a
 * malformed governance block keeps the safety answer and fail-closes only
 * governance. Refusing the whole response would throw away a real safety
 * classification because a `confidence` string was missing.
 */

export interface TriageInput extends A1Input {
  /** A9-pre takes a user id today; nothing downstream reads it, carried for parity. */
  userId?: string;
}

export interface TriageOutput {
  safety: A1Output;
  governance: GovernanceOutput;
  /** True when either half fell back — the turn's `fallbackUsed` must reflect it. */
  fallbackUsed: boolean;
}

const VALID_SAFETY_STATES: ReadonlySet<string> = new Set(['S0', 'S1', 'S2', 'S3', 'S4']);
const VALID_BASES: ReadonlySet<string> = new Set(['literal', 'contextual', 'ambiguous']);
const VALID_STRENGTHS: ReadonlySet<string> = new Set(['high', 'medium', 'low']);
const VALID_GOVERNANCE: ReadonlySet<string> = new Set(['Active', 'Restricted', 'Blocked']);
const VALID_CONFIDENCE: ReadonlySet<string> = new Set(['high', 'medium', 'low']);
const VALID_REASON_CODES: ReadonlySet<string> = new Set([
  'diagnosis_request',
  'medication_request',
  'injection_attempt',
  'roleplay_bypass',
  'third_party_harm',
  'boundary_repeat',
  'safety_relevant_defer',
  'venting_anger',
]);

function safetyFallback(reason: string, message: string): A1Output {
  if (hasCrisisLanguage(message)) {
    return {
      safetyState: 'S4',
      fallbackUsed: true,
      crisis_language_detected: true,
      basis: 'literal',
      signal_strength: 'high',
      notes: `${reason}:crisis_keyword_floor`,
    };
  }
  return {
    safetyState: 'S2',
    fallbackUsed: true,
    crisis_language_detected: false,
    basis: 'ambiguous',
    signal_strength: 'low',
    notes: reason,
  };
}

function governanceFallback(notes: string): GovernanceOutput {
  return {
    governanceState: 'Restricted',
    fallbackUsed: true,
    reasonCode: null,
    confidence: 'low',
    notes,
  };
}

export function isMergedTriageEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.OKUVU_MERGED_TRIAGE === 'true';
}

/** Exported for tests and for the eval's prompt-size measurement. */
export function buildMergedTriagePrompt(): string {
  return buildTriagePrompt();
}

function parseSafety(parsed: Record<string, unknown>): A1Output | null {
  const state = parsed.safetyState;
  const basis = parsed.basis;
  const strength = parsed.signal_strength;
  const crisis = parsed.crisis_language_detected;
  const notes = parsed.safety_notes;

  if (
    typeof state !== 'string' ||
    !VALID_SAFETY_STATES.has(state) ||
    typeof crisis !== 'boolean' ||
    typeof basis !== 'string' ||
    !VALID_BASES.has(basis) ||
    typeof strength !== 'string' ||
    !VALID_STRENGTHS.has(strength) ||
    (notes !== null && notes !== undefined && typeof notes !== 'string')
  ) {
    return null;
  }

  return {
    safetyState: state as SafetyState,
    fallbackUsed: false,
    crisis_language_detected: crisis,
    basis: basis as A1Basis,
    signal_strength: strength as A1SignalStrength,
    notes: (notes as string | null | undefined) ?? null,
  };
}

function parseGovernance(parsed: Record<string, unknown>): GovernanceOutput | null {
  const state = parsed.governanceState;
  const reasonCode = parsed.reasonCode;
  const confidence = parsed.confidence;
  const notes = parsed.governance_notes;

  if (
    typeof state !== 'string' ||
    !VALID_GOVERNANCE.has(state) ||
    (reasonCode !== null && reasonCode !== undefined && (typeof reasonCode !== 'string' || !VALID_REASON_CODES.has(reasonCode))) ||
    typeof confidence !== 'string' ||
    !VALID_CONFIDENCE.has(confidence) ||
    (notes !== null && notes !== undefined && typeof notes !== 'string')
  ) {
    return null;
  }

  return {
    governanceState: state as GovernanceState,
    fallbackUsed: false,
    reasonCode: (reasonCode as GovernanceReasonCode | null | undefined) ?? null,
    confidence: confidence as GovernanceConfidence,
    notes: (notes as string | null | undefined) ?? null,
  };
}

export async function classifyTriage(input: TriageInput): Promise<TriageOutput> {
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  for (const turn of input.recentHistory ?? []) {
    contents.push({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    });
  }
  contents.push({ role: 'user', parts: [{ text: input.message }] });

  const responseSchema = {
    type: 'OBJECT' as const,
    properties: {
      safetyState: { type: 'STRING' as const },
      crisis_language_detected: { type: 'BOOLEAN' as const },
      basis: { type: 'STRING' as const },
      signal_strength: { type: 'STRING' as const },
      safety_notes: { type: 'STRING' as const, nullable: true },
      governanceState: { type: 'STRING' as const },
      reasonCode: { type: 'STRING' as const, nullable: true },
      confidence: { type: 'STRING' as const },
      governance_notes: { type: 'STRING' as const, nullable: true },
    },
    required: [
      'safetyState',
      'crisis_language_detected',
      'basis',
      'signal_strength',
      'governanceState',
      'confidence',
    ],
  };

  let result;
  try {
    result = await generateContent({
      systemInstruction: buildTriagePrompt(),
      contents,
      // Both halves feed a safety/routing decision, so this call is never
      // flex-eligible — see lib/service-tier.ts.
      callRole: 'safety',
      generationConfig: {
        temperature: 0.0,
        responseMimeType: 'application/json',
        responseSchema,
      },
      cannedResponse: JSON.stringify({
        safetyState: 'S0',
        crisis_language_detected: false,
        basis: 'literal',
        signal_strength: 'medium',
        safety_notes: null,
        governanceState: 'Active',
        reasonCode: null,
        confidence: 'medium',
        governance_notes: null,
      }),
    });
  } catch {
    return {
      safety: safetyFallback('llm_api_error', input.message),
      governance: governanceFallback('llm_api_error'),
      fallbackUsed: true,
    };
  }

  if (result.fallbackUsed) {
    const reason =
      result.failureKind === 'throttled'
        ? 'llm_throttled'
        : result.failureKind === 'timeout' || result.failureReason === 'timeout'
          ? 'llm_timeout'
          : 'llm_api_error';
    return {
      safety: safetyFallback(reason, input.message),
      governance: governanceFallback(reason),
      fallbackUsed: true,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.text);
  } catch {
    return {
      safety: safetyFallback('parse_failure', input.message),
      governance: governanceFallback('parse_failure'),
      fallbackUsed: true,
    };
  }

  const obj = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  if (!obj) {
    return {
      safety: safetyFallback('parse_failure', input.message),
      governance: governanceFallback('parse_failure'),
      fallbackUsed: true,
    };
  }

  const safety = parseSafety(obj) ?? safetyFallback('parse_failure:safety_fields', input.message);
  const governance = parseGovernance(obj) ?? governanceFallback('parse_failure:governance_fields');

  return { safety, governance, fallbackUsed: safety.fallbackUsed || governance.fallbackUsed };
}
