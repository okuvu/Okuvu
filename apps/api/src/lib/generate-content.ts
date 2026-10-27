import * as vertexAi from './vertex-ai.js';
import * as openRouter from './openrouter.js';
import { resolveContentBackend } from './provider-config.js';

export type {
  GenerateContentParams,
  GenerateContentResult,
} from './vertex-ai.js';
export { DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_TIMEOUT_MS } from './vertex-ai.js';

export type LlmProvider = 'openrouter' | 'gemini';

/**
 * The pre-existing agent-facing switch (`LLM_PROVIDER`, default `openrouter`,
 * `gemini` as the Vertex rollback). Unchanged on purpose — it is asserted by
 * the dispatcher tests and documents the OpenRouter default.
 */
export function resolveProvider(): LlmProvider {
  return process.env.LLM_PROVIDER === 'gemini' ? 'gemini' : 'openrouter';
}

/**
 * Single call site all four pipeline agents (A1, A2, A9-pre, A9-post) import
 * from. Dispatches to Bedrock, Gemini/Vertex or OpenRouter/Llama based on the
 * backend resolved in `provider-config.ts` — agents themselves never branch on
 * provider.
 *
 * Backend order and defaults (all pre-migration behaviour preserved):
 *   `OKUVU_LLM_PROVIDER=bedrock` → Bedrock  (new, explicit opt-in)
 *   `LLM_PROVIDER=gemini`        → Vertex   (unchanged rollback path)
 *   unset                        → OpenRouter/Llama (unchanged default)
 *
 * A missing `OPENROUTER_API_KEY` while `openrouter` is active fails loudly
 * (thrown) rather than silently substituting Gemini — for a
 * clinically-sensitive pipeline, a silently-swapped provider is worse than a
 * visible error. The Bedrock branch keeps the same fail-closed stance via
 * `bedrock.ts` (errors → `fallbackUsed:true`, never fabricated text).
 *
 * The Bedrock module is imported lazily: it pulls in
 * `@aws-sdk/client-bedrock-runtime`, which must not be loaded — or bundled
 * into apps/test-harness's webpack build, which direct-imports this file — on
 * the OpenRouter/Vertex paths.
 */
export async function generateContent(
  params: vertexAi.GenerateContentParams,
): Promise<vertexAi.GenerateContentResult> {
  const backend = resolveContentBackend();

  if (backend === 'bedrock') {
    const { generateContent: bedrockGenerateContent } = await import('./bedrock.js');
    return bedrockGenerateContent(params);
  }

  if (backend === 'vertex') {
    return vertexAi.generateContent(params);
  }

  if (!process.env.OPENROUTER_API_KEY && !(params.useCanned ?? process.env.USE_CANNED_LLM_RESPONSE === 'true')) {
    throw new Error(
      'LLM_PROVIDER=openrouter but OPENROUTER_API_KEY is not set. Set OPENROUTER_API_KEY, or set LLM_PROVIDER=gemini to use Vertex AI instead.',
    );
  }

  return openRouter.generateContent(params);
}
