import { generateContent } from '../../lib/vertex-ai.js';
import { buildConversationalPrompt } from './prompts.js';
import type { A2Input, A2Output } from './types.js';

export async function handleTurn(input: A2Input): Promise<A2Output> {
  const {
    message,
    carePlan,
    mode,
    recentHistory,
    sessionSummary,
  } = input;

  const systemInstruction = buildConversationalPrompt({
    carePlan,
    sessionSummary,
    mode,
  });

  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> =
    recentHistory.map((turn) => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    }));

  contents.push({
    role: 'user',
    parts: [{ text: message }],
  });

  const result = await generateContent({
    systemInstruction,
    contents,
  });

  return {
    response: result.text,
    fallbackUsed: result.fallbackUsed,
  };
}
