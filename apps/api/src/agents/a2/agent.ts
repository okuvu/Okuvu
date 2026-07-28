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
    toolResultContext,
    userMemoryContext,
  } = input;

  let systemInstruction = buildConversationalPrompt({
    carePlan,
    safetyState,
    sessionNumber,
    turnNumber,
    sessionHistorySummary,
    perceivedIntensity,
    userMemoryContext,
  });

  if (toolResultContext) {
    systemInstruction += '\n\n' + toolResultContext;
  }

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

export function formatUserMemory(memory: {
  life_context: string[];
  current_stressors: string[];
  recurring_themes: string[];
  what_helps: string[];
  what_doesnt_help: string[];
  significant_events: string[];
  emotional_baseline: string | null;
  session_count: number;
} | null): string {
  if (!memory || memory.session_count === 0) return 'null';

  const sections: string[] = [];

  if (memory.life_context.length > 0) {
    sections.push(`Life context: ${memory.life_context.join('. ')}`);
  }
  if (memory.current_stressors.length > 0) {
    sections.push(`Current stressors: ${memory.current_stressors.join('. ')}`);
  }
  if (memory.recurring_themes.length > 0) {
    sections.push(`Recurring themes: ${memory.recurring_themes.join('. ')}`);
  }
  if (memory.what_helps.length > 0) {
    sections.push(`What has helped: ${memory.what_helps.join('. ')}`);
  }
  if (memory.what_doesnt_help.length > 0) {
    sections.push(`What hasn't helped: ${memory.what_doesnt_help.join('. ')}`);
  }
  if (memory.significant_events.length > 0) {
    sections.push(`Significant events: ${memory.significant_events.join('. ')}`);
  }
  if (memory.emotional_baseline) {
    sections.push(`Emotional pattern: ${memory.emotional_baseline}`);
  }

  return sections.join('\n');
}

export function parseA2Response(raw: string): A2ParsedResponse {
  let userContent = stripFencedBlocks(raw);

  let signal: S06Signal | null = null;

  const jsonBlock = extractFirstJsonBlock(raw);
  if (jsonBlock) {
    try {
      signal = JSON.parse(jsonBlock) as S06Signal;
    } catch {
      console.error({ text: jsonBlock }, 'A2: failed to parse S-06 JSON block');
    }
  }

  if (!signal) {
    const fallback = tryParseJsonFallback(raw);
    if (fallback) {
      try {
        signal = JSON.parse(fallback) as S06Signal;
      } catch {
        console.error({ text: fallback }, 'A2: fallback parse also failed');
      }
    }
  }

  if (!jsonBlock && !signal) {
    console.error({ text: raw.slice(0, 200) }, 'A2: no S-06 JSON block found in LLM response');
  }

  const leakedJson = tryParseJsonFallback(userContent);
  if (leakedJson) {
    console.warn({ userContentLength: userContent.length }, 'A2: defense-in-depth caught leaked S-06 signal in userContent');
    userContent = userContent.replace(leakedJson, '').replace(/\n{3,}/g, '\n\n').trim();
  }

  return { userContent, signal };
}

function stripFencedBlocks(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const result: string[] = [];
  let inFence = false;

  for (const line of lines) {
    let remaining = line;
    let hadContent = false;

    while (remaining.length > 0) {
      const fenceMatch = remaining.match(/`{3,}\w*/);
      if (!fenceMatch || fenceMatch.index === undefined) break;

      if (inFence) {
        inFence = false;
        remaining = remaining.slice(fenceMatch.index + fenceMatch[0].length);
      } else {
        const beforeFence = remaining.slice(0, fenceMatch.index).trim();
        if (beforeFence) {
          result.push(beforeFence);
          hadContent = true;
        }
        inFence = true;
        remaining = remaining.slice(fenceMatch.index + fenceMatch[0].length);
      }
    }

    if (!inFence) {
      const trimmed = remaining.trim();
      if (trimmed) {
        result.push(trimmed);
        hadContent = true;
      }
      if (!hadContent && line === '') {
        result.push('');
      }
    }
  }

  return result.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function extractFirstJsonBlock(raw: string): string | null {
  const lines = raw.split(/\r?\n/);
  let inFence = false;
  let fenceLang = '';
  const jsonLines: string[] = [];

  for (const line of lines) {
    const fenceMatch = line.match(/`{3,}(\w*)/);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fenceLang = fenceMatch[1].toLowerCase();
        jsonLines.length = 0;
        const afterFence = line.slice(fenceMatch.index! + fenceMatch[0].length);
        if (afterFence.trim()) {
          jsonLines.push(afterFence);
        }
      } else {
        if (fenceLang === '' || fenceLang === 'json') {
          const beforeClose = line.slice(0, fenceMatch.index!);
          if (beforeClose.trim()) {
            jsonLines.push(beforeClose);
          }
          return jsonLines.join('\n');
        }
        inFence = false;
        jsonLines.length = 0;
      }
      continue;
    }
    if (inFence) {
      jsonLines.push(line);
    }
  }

  if (inFence && jsonLines.length > 0) {
    return jsonLines.join('\n');
  }

  return null;
}

function tryParseJsonFallback(raw: string): string | null {
  const startIdx = raw.indexOf('{');
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  let braceStart = -1;

  for (let i = startIdx; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      escaped = false;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) {
        braceStart = i;
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && braceStart !== -1) {
        const candidate = raw.slice(braceStart, i + 1);
        if (candidate.includes('"signal"') && candidate.includes('"S-06"')) {
          return candidate;
        }
        braceStart = -1;
      }
    }
  }

  return null;
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
