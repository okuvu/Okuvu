import { generateContent } from '../../lib/vertex-ai.js';
import { buildConversationalPrompt, ONBOARDING_SCORING_PROMPT } from './prompts.js';
import type { A2Input, A2Output, ConversationTurn, OnboardingInferenceOutput } from './types.js';

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

const SCORE_FIELDS: ReadonlyArray<keyof OnboardingInferenceOutput> = [
  'anxiety_score', 'depression_score', 'stress_score', 'confidence',
] as const;

const SCORING_RESPONSE_SCHEMA = {
  type: 'OBJECT' as const,
  properties: {
    anxiety_score: { type: 'NUMBER' as const },
    depression_score: { type: 'NUMBER' as const },
    stress_score: { type: 'NUMBER' as const },
    confidence: { type: 'NUMBER' as const },
    reasoning_note: { type: 'STRING' as const },
  },
  required: ['anxiety_score', 'depression_score', 'stress_score', 'confidence', 'reasoning_note'],
};

const SCORING_FALLBACK: OnboardingInferenceOutput = {
  anxiety_score: 0,
  depression_score: 0,
  stress_score: 0,
  confidence: 0,
  reasoning_note: 'Gemini call failed or returned malformed output — treating as low-confidence non-contributing turn',
};

function isValidScore(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value) && value >= 0 && value <= 1;
}

function parseScoringResponse(text: string): OnboardingInferenceOutput | null {
  try {
    const parsed = JSON.parse(text);

    if (typeof parsed !== 'object' || parsed === null) return null;

    for (const field of SCORE_FIELDS) {
      if (!isValidScore(parsed[field])) return null;
    }

    if (typeof parsed.reasoning_note !== 'string') return null;

    return {
      anxiety_score: parsed.anxiety_score,
      depression_score: parsed.depression_score,
      stress_score: parsed.stress_score,
      confidence: parsed.confidence,
      reasoning_note: parsed.reasoning_note,
    };
  } catch {
    return null;
  }
}

export async function scoreOnboardingTurn(
  turns: ConversationTurn[],
): Promise<OnboardingInferenceOutput> {
  const systemInstruction = ONBOARDING_SCORING_PROMPT;

  const contents = turns.map((turn) => ({
    role: turn.role === 'assistant' ? 'model' as const : 'user' as const,
    parts: [{ text: turn.content }],
  }));

  try {
    const result = await generateContent({
      systemInstruction,
      contents,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: SCORING_RESPONSE_SCHEMA,
        maxOutputTokens: 500,
      },
    });

    if (result.fallbackUsed) {
      console.warn({ failureReason: result.failureReason }, 'Onboarding scoring Gemini call fell back — treating as non-contributing');
      return { ...SCORING_FALLBACK };
    }

    const parsed = parseScoringResponse(result.text);
    if (!parsed) {
      console.warn({ text: result.text }, 'Onboarding scoring response was malformed — treating as non-contributing');
      return { ...SCORING_FALLBACK };
    }

    return parsed;
  } catch (err) {
    console.error({ err }, 'Onboarding scoring threw unexpectedly — treating as non-contributing');
    return { ...SCORING_FALLBACK };
  }
}
