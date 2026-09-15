import { generateContent } from '../../lib/generate-content.js';
import { formatUserMemory } from '../a2/agent.js';
import { buildJournalPromptRequest } from './prompts.js';
import { getFallbackJournalPrompt } from './fallback-prompts.js';

export type UserMemoryInput = Parameters<typeof formatUserMemory>[0];

/**
 * J2 — generates one short journaling prompt, personalized from
 * chat-derived UserMemory themes when available. Fails closed to a
 * curated static prompt on any error, unparseable output, or when there's
 * no UserMemory yet (new users) — never leaves the journal screen without
 * a prompt to show.
 */
export async function generateJournalPrompt(userMemory: UserMemoryInput): Promise<string> {
  const themes = formatUserMemory(userMemory);

  const responseSchema = {
    type: 'OBJECT' as const,
    properties: {
      prompt: { type: 'STRING' as const },
    },
    required: ['prompt'],
  };

  let result: { text: string; fallbackUsed: boolean };

  try {
    result = await generateContent({
      systemInstruction: buildJournalPromptRequest(themes),
      contents: [{ role: 'user', parts: [{ text: 'Write the prompt.' }] }],
      generationConfig: {
        temperature: 0.9,
        responseMimeType: 'application/json',
        responseSchema,
      },
      cannedResponse: JSON.stringify({ prompt: getFallbackJournalPrompt() }),
    });
  } catch {
    console.error({ reason: 'llm_api_error' }, 'J2 journal prompt generation failed');
    return getFallbackJournalPrompt();
  }

  if (result.fallbackUsed) {
    console.error({ reason: 'llm_fallback' }, 'J2 journal prompt generation failed');
    return getFallbackJournalPrompt();
  }

  try {
    const parsed = JSON.parse(result.text);
    if (typeof parsed?.prompt === 'string' && parsed.prompt.trim().length > 0) {
      return parsed.prompt.trim();
    }
    console.error({ reason: 'parse_failure' }, 'J2 journal prompt generation failed');
    return getFallbackJournalPrompt();
  } catch {
    console.error({ reason: 'parse_failure' }, 'J2 journal prompt generation failed — unparseable JSON');
    return getFallbackJournalPrompt();
  }
}
