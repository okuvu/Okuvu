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
 * Worker's own copy of apps/api/src/lib/generate-content.ts's dispatcher.
 * apps/api and apps/worker are separate deployable services that only share
 * packages/prisma and packages/shared-types as workspace packages, so this
 * can't be a direct cross-app import.
 *
 * Audit fix: summary.ts and memory-extraction.ts previously imported
 * vertex-ai.ts directly, so session summarization and memory extraction
 * kept running on Gemini after the live chat pipeline (apps/api) migrated
 * to OpenRouter/Llama by default — an inherited inconsistency, not a
 * deliberate one. This closes it: same `LLM_PROVIDER` env var, same default
 * (`openrouter`), same rollback path (`LLM_PROVIDER=gemini`) as the live
 * pipeline.
 */
export async function generateContent(
  params: vertexAi.GenerateContentParams,
): Promise<vertexAi.GenerateContentResult> {
  const provider = resolveProvider();

  if (provider === 'gemini') {
    return vertexAi.generateContent(params);
  }

  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error(
      'LLM_PROVIDER=openrouter but OPENROUTER_API_KEY is not set. Set OPENROUTER_API_KEY, or set LLM_PROVIDER=gemini to use Vertex AI instead.',
    );
  }

  return openRouter.generateContent(params);
}
