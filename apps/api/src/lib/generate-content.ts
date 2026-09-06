import * as vertexAi from './vertex-ai.js';
import * as openRouter from './openrouter.js';

export type {
  GenerateContentParams,
  GenerateContentResult,
} from './vertex-ai.js';
export { DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_TIMEOUT_MS } from './vertex-ai.js';

export type LlmProvider = 'openrouter' | 'gemini';

export function resolveProvider(): LlmProvider {
  return process.env.LLM_PROVIDER === 'gemini' ? 'gemini' : 'openrouter';
}

/**
 * Single call site all four pipeline agents (A1, A2, A9-pre, A9-post) import
 * from. Dispatches to Gemini/Vertex or OpenRouter/Llama based on
 * `LLM_PROVIDER` — agents themselves never branch on provider. Defaults to
 * `openrouter`; set `LLM_PROVIDER=gemini` to roll back to the Vertex path.
 * A missing `OPENROUTER_API_KEY` while `openrouter` is active fails loudly
 * (thrown) rather than silently substituting Gemini — for a
 * clinically-sensitive pipeline, a silently-swapped provider is worse than a
 * visible error.
 */
export async function generateContent(
  params: vertexAi.GenerateContentParams,
): Promise<vertexAi.GenerateContentResult> {
  const provider = resolveProvider();

  if (provider === 'gemini') {
    return vertexAi.generateContent(params);
  }

  if (!process.env.OPENROUTER_API_KEY && !(params.useCanned ?? process.env.USE_CANNED_LLM_RESPONSE === 'true')) {
    throw new Error(
      'LLM_PROVIDER=openrouter but OPENROUTER_API_KEY is not set. Set OPENROUTER_API_KEY, or set LLM_PROVIDER=gemini to use Vertex AI instead.',
    );
  }

  return openRouter.generateContent(params);
}
