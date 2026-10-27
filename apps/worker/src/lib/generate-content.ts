import type { GenerateContentParams, GenerateContentResult } from './llm-types.js';

export type { GenerateContentParams, GenerateContentResult } from './llm-types.js';
export { DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_TIMEOUT_MS } from './llm-types.js';

/**
 * Worker's copy of apps/api/src/lib/generate-content.ts's dispatcher.
 * apps/api and apps/worker are separate deployable services that only share
 * packages/prisma and packages/shared-types as workspace packages, so this
 * can't be a direct cross-app import.
 *
 * AWS cutover (docs/AWS-CUTOVER-SPEC.md): Amazon Bedrock is the worker's LLM
 * — the cloud-SDK branch this file used to dispatch to is deleted, and so is
 * the `OKUVU_LLM_PROVIDER` switch that used to select it. Setting that var (to
 * any value, including a misspelling) has no effect: `hidden` provider flips
 * are exactly what the cutover removed, so a typo must not be able to move
 * clinical text to a provider the operator did not choose.
 *
 * `LLM_PROVIDER=openrouter` is the one pre-existing, non-AWS escape hatch kept
 * from before the cutover (same var the API still honours); it must be set
 * explicitly and needs `OPENROUTER_API_KEY`. Unset — the default — means
 * Bedrock.
 *
 * The Bedrock module is imported lazily so `@aws-sdk/client-bedrock-runtime`
 * only loads when Bedrock is actually used.
 */
export async function generateContent(
  params: GenerateContentParams,
): Promise<GenerateContentResult> {
  if (process.env.LLM_PROVIDER === 'openrouter') {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error(
        'LLM_PROVIDER=openrouter but OPENROUTER_API_KEY is not set. Set OPENROUTER_API_KEY, or unset LLM_PROVIDER to use Bedrock (the worker default).',
      );
    }

    const { generateContent: openRouterGenerateContent } = await import('./openrouter.js');
    return openRouterGenerateContent(params);
  }

  const { generateContent: bedrockGenerateContent } = await import('./bedrock.js');
  return bedrockGenerateContent(params);
}
