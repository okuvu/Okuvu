import { generateContent } from '../../lib/vertex-ai.js';
import type { SafetyState } from '@evia/shared-types';
import { buildSafetyPrompt } from './prompts.js';
import type { A1Input, A1Output } from './types.js';

const A1_FALLBACK_STATE: SafetyState = 'S2';

const VALID_SAFETY_STATES: ReadonlySet<string> = new Set(['S0', 'S1', 'S2', 'S3', 'S4']);

function isValidSafetyState(value: string): value is SafetyState {
  return VALID_SAFETY_STATES.has(value);
}

export async function classifySafety(input: A1Input): Promise<A1Output> {
  const systemInstruction = buildSafetyPrompt(input);

  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  if (input.recentHistory && input.recentHistory.length > 0) {
    for (const turn of input.recentHistory) {
      contents.push({
        role: turn.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: turn.content }],
      });
    }
  }

  contents.push({
    role: 'user',
    parts: [{ text: input.message }],
  });

  const responseSchema = {
    type: 'OBJECT' as const,
    properties: {
      safetyState: {
        type: 'STRING' as const,
      },
    },
    required: ['safetyState'],
  };

  let result: { text: string; fallbackUsed: boolean; failureReason?: 'timeout' | 'api_error' };

  try {
    result = await generateContent({
      systemInstruction,
      contents,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema,
      },
    });
  } catch {
    console.error({ reason: 'gemini_api_error' }, 'A1 safety classification failed');
    return { safetyState: A1_FALLBACK_STATE, fallbackUsed: true };
  }

  if (result.fallbackUsed) {
    const reason = result.failureReason === 'timeout' ? 'gemini_timeout' : 'gemini_api_error';
    console.error({ reason }, 'A1 safety classification failed');
    return { safetyState: A1_FALLBACK_STATE, fallbackUsed: true };
  }

  try {
    const parsed = JSON.parse(result.text);

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.safetyState === 'string' &&
      isValidSafetyState(parsed.safetyState)
    ) {
      return { safetyState: parsed.safetyState, fallbackUsed: false };
    }

    console.error({ reason: 'parse_failure', received: parsed?.safetyState ?? typeof parsed }, 'A1 safety classification failed');
    return { safetyState: A1_FALLBACK_STATE, fallbackUsed: true };
  } catch {
    console.error({ reason: 'parse_failure', text: result.text }, 'A1 safety classification failed — unparseable JSON');
    return { safetyState: A1_FALLBACK_STATE, fallbackUsed: true };
  }
}
