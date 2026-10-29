import { generateContent } from '../../lib/generate-content.js';
import { buildConversationalPrompt } from './prompts.js';
import { A2_PROMPT_VERSION } from '../../prompts/index.js';
import type {
  A2Input,
  A2Output,
  A2ParsedResponse,
  S07Signal,
} from './types.js';

/**
 * Canned/sandbox mode never calls Gemini — without this, every A2 turn got
 * back the same generic SAFE_FALLBACK prose regardless of what the user
 * typed, which is what made sandbox conversations look broken (identical
 * reply to every message). A small deterministic pool keyed off the message
 * text keeps replies varied without spending real model calls.
 */
const CANNED_REPLIES = [
  "That sounds like a lot to carry right now. What feels most present for you in this moment?",
  "Thank you for sharing that with me — can you tell me a bit more about what's been going on?",
  "I hear you. It makes sense that you'd feel that way given what you've described.",
  "I'm glad you brought this up. What would feel most helpful to explore together right now?",
  "That's a really valid thing to be feeling. How long has this been weighing on you?",
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function buildCannedReply(message: string): string {
  return CANNED_REPLIES[hashString(message) % CANNED_REPLIES.length];
}

export async function handleTurn(input: A2Input): Promise<A2Output> {
  const {
    message,
    safetyState,
    sessionHistorySummary,
    perceivedIntensity,
    recentHistory,
    toolResultContext,
    userMemoryContext,
    retrievedContext,
    therapistName,
    carePlanFocus,
    homework,
    toolkit,
    languageMode,
  } = input;

  let systemInstruction = buildConversationalPrompt({
    safetyState,
    sessionHistorySummary,
    perceivedIntensity,
    userMemoryContext,
    retrievedContext,
    therapistName,
    carePlanFocus,
    homework,
    toolkit,
    languageMode,
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
    cannedResponse: buildCannedReply(message),
  });

  const parsed = parseA2Response(result.text);

  return {
    response: result.text,
    userContent: parsed.userContent,
    signal: parsed.signal,
    fallbackUsed: result.fallbackUsed,
    failureReason: result.failureReason,
    failureKind: result.failureKind,
    modelVersion: result.model,
    promptVersion: A2_PROMPT_VERSION,
    canned: result.canned,
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
  userContent = stripSignalMarkers(userContent);

  let signal: S07Signal | null = null;

  const jsonBlock = extractFirstJsonBlock(raw);
  if (jsonBlock) {
    try {
      signal = JSON.parse(jsonBlock) as S07Signal;
    } catch {
      console.error({ chars: jsonBlock.length }, 'A2: failed to parse S-07 JSON block');
    }
  }

  if (!signal) {
    const fallback = tryParseJsonFallback(raw);
    if (fallback) {
      try {
        signal = JSON.parse(fallback) as S07Signal;
      } catch {
        console.error({ chars: fallback.length }, 'A2: fallback parse also failed');
      }
    }
  }

  if (!jsonBlock && !signal) {
    console.error({ chars: raw.length }, 'A2: no S-07 JSON block found in LLM response');
  }

  const leakedJson = tryParseJsonFallback(userContent);
  if (leakedJson) {
    console.warn({ userContentLength: userContent.length }, 'A2: defense-in-depth caught leaked S-07 signal in userContent');
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

/**
 * A5 (OKUVU — Plumbing Fixes & Rationale v1.0): the fenced-block stripper
 * above only removes ``` fences, so a model that improvises its own prose
 * header for the signal block — e.g. "BLOCK 2 — MACHINE SIGNAL (stripped
 * before delivery to user)" instead of the expected fence — leaked that
 * scaffolding straight into user-visible text. Strip EVERYTHING from the
 * first signal-marker onward — standalone header lines AND markers dropped
 * mid-line — not just the expected fence: the signal block is the last
 * thing A2 emits, so nothing from a marker onward is ever user-facing
 * prose. Any prose BEFORE the marker on the same line is kept.
 *
 * Case-sensitivity is deliberate: the leaked scaffolding is always
 * uppercase ("BLOCK 2 — MACHINE SIGNAL"), and a case-insensitive match
 * would over-strip ordinary replies containing e.g. "a block — ...".
 * "stripped before delivery" is distinctive enough to match regardless of
 * case.
 */
const SIGNAL_MARKER_RE = /\**\s*(?:BLOCK(?:\s*\d+)?\s*[—\-–:]|MACHINE SIGNAL)/;
const SIGNAL_MARKER_SOFT_RE = /stripped\s+before\s+delivery/i;

function stripSignalMarkers(text: string): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];

  for (const line of lines) {
    const markerMatch = SIGNAL_MARKER_RE.exec(line) ?? SIGNAL_MARKER_SOFT_RE.exec(line);
    if (markerMatch && markerMatch.index !== undefined) {
      console.warn({ chars: line.length }, 'A2: improvised signal marker found in user-facing text — truncated everything from it');
      const before = line.slice(0, markerMatch.index).replace(/[—\-–:\s]+$/, '').trim();
      if (before) kept.push(before);
      break;
    }
    kept.push(line);
  }

  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
        if (candidate.includes('"signal"') && candidate.includes('"S-07"')) {
          return candidate;
        }
        braceStart = -1;
      }
    }
  }

  return null;
}

