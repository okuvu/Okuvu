import { generateContent } from './vertex-ai.js';

export type ProviderName = 'sarvam' | 'gemini';

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
      'Sarvam LLM not yet implemented; using Gemini fallback',
    );
  }

  const result = await generateContent({
    systemInstruction: params.systemInstruction,
    contents: [{ role: 'user', parts: [{ text: params.text }] }],
  });

  return {
    text: result.text,
    fallbackUsed: result.fallbackUsed,
    provider: 'gemini',
  };
}
