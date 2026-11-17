import { generateContent } from '../../lib/generate-content.js';
import { buildConversationalPrompt } from './prompts.js';
import { A2_PROMPT_VERSION } from '../../prompts/index.js';
import {
  A2_STRUCTURED_OUTPUT_SCHEMA,
  isA2StructuredOutputEnabled,
  parseStructuredEnvelope,
} from './structured-schema.js';
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

/**
 * Appended to the system instruction on the one repair attempt after an empty
 * visible reply.
 *
 * The observed failure (E17-S14 follow-up, 17 Nov): on a closing turn — client
 * says "Alright, I can try that this week" — Qwen3-32B returned Block 2 alone.
 * The whole response was the fenced S-07 JSON and nothing else, so the parser
 * correctly stripped the machine block and was left with an empty string, and
 * `fallbackUsed` was false because the call itself had succeeded. The client
 * would have received a blank bubble. The prompt already says "never send
 * Block 1 alone" (§11); this is the mirror case it never named, so the repair
 * asks for the missing half directly rather than hoping a re-roll complies.
 *
 * Same system instruction, same history: the repair must keep the voice and the
 * rules that produced the signal, not restart the turn under a different brief.
 */
export const REPLY_ONLY_REPAIR_DIRECTIVE = `

# REPAIR — THIS ATTEMPT ONLY
Your previous attempt returned only the machine signal block and no reply for the person. Write Block 1 now: two to four sentences of your actual reply to them, in their register, following every rule above. Do not output the machine block again. Do not explain this instruction.`;

/** A reply that carries no words is not a reply — see REPLY_ONLY_REPAIR_DIRECTIVE. */
function isBlankReply(text: string): boolean {
  return text.replace(/[\s\p{P}\p{S}]/gu, '').length === 0;
}

/**
 * Fenced-block recovery for the other shape of the same failure: a model that
 * wraps its *prose* in a fence (```text / ```markdown, or bare ```) leaves
 * `stripFencedBlocks` with nothing, because that function removes every fenced
 * block on the assumption that fences are machine signal. Recovering the prose
 * costs nothing and avoids a model call; the signal block is skipped by shape,
 * not by position, so a reply that legitimately quotes a JSON snippet still
 * comes through.
 */
function recoverFencedProse(raw: string): string | null {
  const blocks = raw.matchAll(/```([\w-]*)[^\S\r\n]*\r?\n([\s\S]*?)```/g);
  for (const block of blocks) {
    const lang = block[1].toLowerCase();
    const body = block[2].trim();
    if (body.length === 0) continue;
    if (lang === 'json') continue;
    if (body.includes('"signal"') && body.includes('S-07')) continue;
    if (isBlankReply(body)) continue;
    return body;
  }
  return null;
}

/**
 * A model that labels its own output ("OKUVU: …", "A2: …") is leaking the
 * scaffolding the same way the improvised "BLOCK 2" headers did (see
 * stripSignalMarkers). Observed live: a reply that opened `OKUVU: "You're not
 * asking me to fix it…`. Stripping the label is not cosmetic on a first line —
 * it is the difference between a companion and a machine announcing itself.
 */
function stripSpeakerLabel(text: string): string {
  return text.replace(/^\s*(?:OKUVU|A2|Companion)\s*[:—–]\s*/i, '').trim();
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

  // E17-S18 — the same system instruction either way (see structured-schema.ts);
  // the only difference is whether the two-block envelope is *requested in prose*
  // (§10/§11 of the sheet — honoured on ~54% of turns in the four-arm probe) or
  // *constrained by a forced tool schema* (63/63 in the same probe, with the
  // reply inside the schema's `reply` field). `A2_STRUCTURED_OUTPUT=off` restores
  // the prose contract exactly, so a warmth regression is one env change from
  // diagnosed rather than a revert.
  const structuredOutput = isA2StructuredOutputEnabled();
  const generationConfig = structuredOutput
    ? { responseSchema: A2_STRUCTURED_OUTPUT_SCHEMA }
    : undefined;

  const result = await generateContent({
    systemInstruction,
    contents,
    cannedResponse: buildCannedReply(message),
    ...(generationConfig ? { generationConfig } : {}),
  });

  let parsed = parseA2Response(result.text);
  let replyText = result.text;
  let replyRepaired = false;

  // An empty visible reply is a technical failure of this agent's contract, not
  // a quiet turn: the client gets a blank bubble and the transcript records a
  // turn that said nothing. One repair attempt, then fail closed — never
  // deliver ''. Canned replies are exempt: they are fixed prose that the
  // parser cannot empty, and re-calling in sandbox mode would spend nothing but
  // would also prove nothing.
  if (!result.fallbackUsed && !result.canned && isBlankReply(parsed.userContent)) {
    console.error(
      { chars: result.text.length, hasSignal: parsed.signal !== null, model: result.model },
      'A2: empty visible reply — attempting one repair',
    );

    const repair = await generateContent({
      systemInstruction: systemInstruction + REPLY_ONLY_REPAIR_DIRECTIVE,
      contents,
      cannedResponse: buildCannedReply(message),
      // Same schema as the first attempt: a repair that came back in prose would
      // reintroduce the very failure it exists to fix.
      ...(generationConfig ? { generationConfig } : {}),
    });

    const repaired = parseA2Response(repair.text);
    if (!repair.fallbackUsed && !repair.canned && !isBlankReply(repaired.userContent)) {
      parsed = { userContent: repaired.userContent, signal: repaired.signal ?? parsed.signal };
      replyText = repair.text;
      replyRepaired = true;
    } else {
      // Fail closed. `userContent` stays empty on purpose — the caller must not
      // be able to forward a substituted string as if A2 had written it; the
      // orchestrator serves the governed fallback and records the turn as a
      // fallback rather than a reply.
      console.error({ model: result.model }, 'A2: repair produced no visible reply — failing closed');
      return {
        response: replyText,
        userContent: '',
        signal: parsed.signal,
        fallbackUsed: true,
        failureReason: 'api_error',
        failureKind: 'unavailable',
        modelVersion: result.model,
        promptVersion: A2_PROMPT_VERSION,
        canned: result.canned,
        replyRepaired: false,
      };
    }
  }

  return {
    response: replyText,
    userContent: parsed.userContent,
    signal: parsed.signal,
    fallbackUsed: result.fallbackUsed,
    failureReason: result.failureReason,
    failureKind: result.failureKind,
    modelVersion: result.model,
    promptVersion: A2_PROMPT_VERSION,
    canned: result.canned,
    replyRepaired,
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
  // E17-S18 — the forced-tool shape first. A structured answer is one JSON
  // object carrying both halves, so every prose heuristic below (strip fences,
  // find a fenced JSON block, recover fenced prose, catch a leaked signal) is
  // answering a question this shape has already answered. Doing it here rather
  // than in `handleTurn` means every existing caller — the eval probes, the
  // evidence readers, the harness — keeps working on structured text with no
  // change of its own, and a prose answer still falls through unchanged.
  const structured = parseStructuredEnvelope(raw);
  if (structured) {
    return {
      userContent: stripSpeakerLabel(structured.userContent),
      signal: structured.signal,
    };
  }

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

  // Last recovery before this is reported as a blank reply: the model fenced
  // its own prose (see recoverFencedProse). Runs after the signal block has
  // been located, so it cannot pick the machine block up as the reply.
  if (isBlankReply(userContent)) {
    const recovered = recoverFencedProse(raw);
    if (recovered) {
      console.warn({ chars: recovered.length }, 'A2: visible reply was fenced — recovered Block 1 from the fence');
      userContent = recovered;
    }
  }

  userContent = stripSpeakerLabel(userContent);

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

