import { generateContent } from '../../lib/generate-content.js';
import { buildGovernancePrompt } from './prompts.js';
import type {
  GovernanceConfidence,
  GovernanceInput,
  GovernanceOutput,
  GovernanceReasonCode,
  GovernanceState,
} from './types.js';

const VALID_STATES: ReadonlySet<string> = new Set(['Active', 'Restricted', 'Blocked']);
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
const VALID_CONFIDENCES: ReadonlySet<string> = new Set(['high', 'medium', 'low']);

function isValidReasonCode(value: unknown): value is GovernanceReasonCode {
  return typeof value === 'string' && VALID_REASON_CODES.has(value);
}

function isValidConfidence(value: unknown): value is GovernanceConfidence {
  return typeof value === 'string' && VALID_CONFIDENCES.has(value);
}

// Fail-closed per the v2.0 spec ("parse failure -> Restricted, notes
// 'parse_error'") — never silent-pass to Active, never escalate to Blocked
// on a technical failure.
function fallbackOutput(notes: string): GovernanceOutput {
  return {
    governanceState: 'Restricted',
    fallbackUsed: true,
    reasonCode: null,
    confidence: 'low',
    notes,
  };
}

const FLASH_LITE_MODEL =
  process.env.GEMINI_FLASH_LITE_MODEL ?? 'gemini-2.5-flash';

/**
 * FLASH_LITE_MODEL is a Gemini-specific model name — passing it as an
 * explicit `model` override when OpenRouter is the active provider would
 * send that nonexistent model id straight to OpenRouter's API. Omit it in
 * that case so generate-content.ts's own provider-appropriate default
 * (OPENROUTER_MODEL) applies instead.
 */
function resolveModelOverride(): string | undefined {
  return process.env.LLM_PROVIDER === 'gemini' ? FLASH_LITE_MODEL : undefined;
}

export async function classifyGovernance(
  input: GovernanceInput,
): Promise<GovernanceOutput> {
  const systemInstruction = buildGovernancePrompt();

  try {
    const result = await generateContent({
      systemInstruction,
      contents: [{ role: 'user', parts: [{ text: input.message }] }],
      model: resolveModelOverride(),
      generationConfig: {
        // Deterministic classification (OKUVU v2.0 spec) — A9-pre previously
        // had no explicit temperature, inheriting the provider default of 0.7.
        temperature: 0.0,
        maxOutputTokens: 200,
        responseMimeType: 'application/json',
      },
      // Canned/sandbox mode never calls Gemini — without this the generic
      // fallback prose fails to parse and every sandbox turn silently
      // classified as 'Restricted'.
      cannedResponse: JSON.stringify({
        governanceState: 'Active',
        reasonCode: null,
        confidence: 'medium',
        notes: null,
      }),
    });

    const parsed: unknown = JSON.parse(result.text);
    const obj = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
    const state = obj?.governanceState;
    const reasonCode = obj?.reasonCode;
    const confidence = obj?.confidence;
    const notes = obj?.notes;

    if (
      typeof state !== 'string' ||
      !VALID_STATES.has(state) ||
      (reasonCode !== null && !isValidReasonCode(reasonCode)) ||
      !isValidConfidence(confidence) ||
      (notes !== null && notes !== undefined && typeof notes !== 'string')
    ) {
      console.info(
        { governanceState: state, raw: result.text },
        'A9: invalid governance output, falling back to Restricted',
      );
      return fallbackOutput('parse_error');
    }

    console.info({ governanceState: state }, 'A9: classification complete');
    return {
      governanceState: state as GovernanceState,
      fallbackUsed: false,
      reasonCode: (reasonCode as GovernanceReasonCode | null) ?? null,
      confidence: confidence as GovernanceConfidence,
      notes: (notes as string | null | undefined) ?? null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.info({ err: message }, 'A9: error, falling back to Restricted');
    return fallbackOutput('parse_error');
  }
}
