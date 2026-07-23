import { generateContent } from '../../lib/vertex-ai.js';
import { buildConversationalPrompt, ONBOARDING_SCORING_PROMPT } from './prompts.js';
import type {
  A2Input,
  A2Output,
  A2ParsedResponse,
  S06Signal,
  ConversationTurn,
  OnboardingInferenceOutput,
} from './types.js';

const ONBOARDING_OPENING_PROMPT = `You are Evia, a warm and empathetic mental wellness assistant. This is the very first interaction with a new user during onboarding.
Your task is to generate a brief, welcoming opening message (2-3 sentences) that:
- Greets the user warmly
- Encourages them to share what's been on their mind
- Is gentle, non-judgmental, and inviting
- Does NOT mention care plans, clinical terms, diagnoses, or scores

Example tone: "Hi there! I'm Evia. Thanks for taking this moment for yourself. What's been on your mind lately?"`;

export async function handleTurn(input: A2Input): Promise<A2Output> {
  const {
    message,
    carePlan,
    safetyState,
    sessionNumber,
    turnNumber,
    sessionHistorySummary,
    perceivedIntensity,
    mode,
    recentHistory,
  } = input;

  const systemInstruction = buildConversationalPrompt({
    carePlan,
    safetyState,
    sessionNumber,
    turnNumber,
    sessionHistorySummary,
    perceivedIntensity,
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

  const parsed = parseA2Response(result.text);

  return {
    response: result.text,
    userContent: parsed.userContent,
    signal: parsed.signal,
    fallbackUsed: result.fallbackUsed,
  };
}

export function parseA2Response(raw: string): A2ParsedResponse {
  const jsonMatch = raw.match(/```json\n([\s\S]*?)\n```/);
  const userContent = raw.replace(/```json[\s\S]*?```/g, '').trim();

  let signal: S06Signal | null = null;
  if (jsonMatch) {
    try {
      signal = JSON.parse(jsonMatch[1]) as S06Signal;
    } catch {
      console.warn({ text: jsonMatch[1] }, 'A2: failed to parse S-06 JSON block');
    }
  }

  return { userContent, signal };
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

export async function generateOnboardingOpening(): Promise<string> {
  try {
    const result = await generateContent({
      systemInstruction: ONBOARDING_OPENING_PROMPT,
      contents: [{ role: 'user', parts: [{ text: 'Open the conversation with the new user.' }] }],
      generationConfig: { maxOutputTokens: 150 },
    });

    if (result.fallbackUsed) {
      return "Hi there! I'm Evia. Thanks for taking this moment for yourself. What's been on your mind lately?";
    }

    return result.text.trim();
  } catch {
    return "Hi there! I'm Evia. Thanks for taking this moment for yourself. What's been on your mind lately?";
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
