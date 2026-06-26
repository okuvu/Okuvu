import { generateText } from '../../lib/llm-provider.js';
import { buildRenderPrompt } from './prompts.js';
import type { RenderInput, RenderOutput } from './types.js';

export async function renderText(input: RenderInput): Promise<RenderOutput> {
  const systemInstruction = buildRenderPrompt();

  try {
    const result = await generateText({
      systemInstruction,
      text: input.text,
    });

    return {
      text: result.text,
      fallbackUsed: result.fallbackUsed,
      provider: result.provider,
    };
  } catch {
    return {
      text: input.text,
      fallbackUsed: true,
      provider: 'gemini',
    };
  }
}
