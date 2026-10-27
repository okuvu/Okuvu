import * as openRouter from './openrouter.js';
import { resolveContentBackend } from './provider-config.js';
import type { GenerateContentParams, GenerateContentResult } from './llm-types.js';

export type { GenerateContentParams, GenerateContentResult } from './llm-types.js';
export { DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_TIMEOUT_MS } from './llm-types.js';

export type LlmProvider = 'openrouter' | 'bedrock';

/**
 * Agent-facing provider switch. `openrouter` stays the default (what the
 * dispatcher tests assert); `bedrock` is the in-VPC AWS path.
 */
export function resolveProvider(): LlmProvider {
  return process.env.LLM_PROVIDER === 'bedrock' ? 'bedrock' : 'openrouter';
}

/**
 * Single call site all four pipeline agents (A1, A2, A9-pre, A9-post) import
 * from. Dispatches to Amazon Bedrock or OpenRouter/Llama based on the backend
 * resolved in `provider-config.ts` — agents themselves never branch on
 * provider.
 *
 * Backend order and defaults:
 *   `LLM_PROVIDER=bedrock` → Amazon Bedrock, in-region in ap-south-1
 *   unset / anything else  → OpenRouter/Llama (default)
 *
 * A missing `OPENROUTER_API_KEY` while `openrouter` is active fails loudly
 * (thrown) rather than silently substituting another provider — for a
 * clinically-sensitive pipeline, a silently-swapped provider is worse than a
 * visible error. The Bedrock branch keeps the same fail-closed stance via
 * `bedrock.ts` (errors → `fallbackUsed:true`, never fabricated text).
 *
 * The Bedrock module is imported lazily: it pulls in
 * `@aws-sdk/client-bedrock-runtime`, which must not be loaded — or bundled
 * into apps/test-harness's webpack build, which direct-imports this file — on
 * the OpenRouter path.
 */
export async function generateContent(
  params: GenerateContentParams,
): Promise<GenerateContentResult> {
  const backend = resolveContentBackend();

  if (backend === 'bedrock') {
    const { generateContent: bedrockGenerateContent } = await import('./bedrock.js');
    return bedrockGenerateContent(params);
  }

  if (
    !process.env.OPENROUTER_API_KEY &&
    !(params.useCanned ?? process.env.USE_CANNED_LLM_RESPONSE === 'true')
  ) {
    throw new Error(
      'LLM_PROVIDER=openrouter but OPENROUTER_API_KEY is not set. Set OPENROUTER_API_KEY, or set LLM_PROVIDER=bedrock to use Amazon Bedrock instead.',
    );
  }

  return openRouter.generateContent(params);
}
