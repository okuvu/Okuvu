import { generateContent } from '../../lib/generate-content.js';
import { buildGovernancePrompt } from './prompts.js';
import type { GovernanceInput, GovernanceOutput, GovernanceState } from './types.js';

const VALID_STATES: ReadonlySet<string> = new Set(['Active', 'Restricted', 'Blocked']);

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
        maxOutputTokens: 200,
        responseMimeType: 'application/json',
      },
      // Canned/sandbox mode never calls Gemini — without this the generic
      // fallback prose fails to parse and every sandbox turn silently
      // classified as 'Restricted'.
      cannedResponse: JSON.stringify({ governanceState: 'Active' }),
    });

    const parsed: unknown = JSON.parse(result.text);
    const state =
      typeof parsed === 'object' &&
      parsed !== null &&
      'governanceState' in parsed
        ? (parsed as Record<string, unknown>).governanceState
        : undefined;

    if (typeof state !== 'string' || !VALID_STATES.has(state)) {
      console.info(
        { governanceState: state, raw: result.text },
        'A9: invalid governance state, falling back to Restricted',
      );
      return { governanceState: 'Restricted', fallbackUsed: true };
    }

    console.info({ governanceState: state }, 'A9: classification complete');
    return { governanceState: state as GovernanceState, fallbackUsed: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.info({ err: message }, 'A9: error, falling back to Restricted');
    return { governanceState: 'Restricted', fallbackUsed: true };
  }
}
