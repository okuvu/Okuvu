import { generateContent, resolveProvider } from './generate-content.js';

/**
 * Legacy text-generation shim. The label it reports is the backend the
 * dispatcher actually used — `bedrock` or `openrouter` — resolved from the same
 * `LLM_PROVIDER` switch `generate-content.ts` branches on, so a caller can log
 * provenance without guessing. The old `'gemini'` label named a provider this
 * service no longer has (docs/AWS-CUTOVER-SPEC.md).
 */
export type ProviderName = 'bedrock' | 'openrouter';

export function isSarvamConfigured(): boolean {
  return !!process.env.SARVAM_API_KEY;
}

export async function generateText(params: {
  systemInstruction: string;
  text: string;
}): Promise<{ text: string; fallbackUsed: boolean; provider: ProviderName }> {
  if (isSarvamConfigured()) {
    console.info(
      { provider: 'sarvam', status: 'stub' },
      'Sarvam LLM not yet implemented; using the configured LLM backend',
    );
  }

  const result = await generateContent({
    systemInstruction: params.systemInstruction,
    contents: [{ role: 'user', parts: [{ text: params.text }] }],
  });

  return {
    text: result.text,
    fallbackUsed: result.fallbackUsed,
    provider: resolveProvider(),
  };
}
