import { generateContent } from '../../lib/generate-content.js';
import type { SafetyState } from '@okuvu/shared-types';
import { buildSafetyPrompt } from './prompts.js';
import { hasCrisisLanguage } from './crisis-keywords.js';
import type { A1Basis, A1Input, A1Output, A1SignalStrength } from './types.js';

const A1_FALLBACK_STATE: SafetyState = 'S2';

const VALID_SAFETY_STATES: ReadonlySet<string> = new Set(['S0', 'S1', 'S2', 'S3', 'S4']);
const VALID_BASES: ReadonlySet<string> = new Set(['literal', 'contextual', 'ambiguous']);
const VALID_SIGNAL_STRENGTHS: ReadonlySet<string> = new Set(['high', 'medium', 'low']);

function isValidSafetyState(value: string): value is SafetyState {
  return VALID_SAFETY_STATES.has(value);
}

function isValidBasis(value: unknown): value is A1Basis {
  return typeof value === 'string' && VALID_BASES.has(value);
}

function isValidSignalStrength(value: unknown): value is A1SignalStrength {
  return typeof value === 'string' && VALID_SIGNAL_STRENGTHS.has(value);
}

// Fail-closed defaults for every path that can't reach a real model
// classification (timeout, API error, or unparseable output). safetyState
// still fails to S2 (never S0); the new v2.0 fields fail to their most
// conservative values so a technical failure never silently reads as "no
// crisis language, high confidence" on the review queue.
function fallbackOutput(reason: string): A1Output {
  return {
    safetyState: A1_FALLBACK_STATE,
    fallbackUsed: true,
    crisis_language_detected: false,
    basis: 'ambiguous',
    signal_strength: 'low',
    notes: reason,
  };
}

/**
 * Canned/sandbox mode never calls Gemini — without this, every message got
 * back the same generic prose the safety classifier can't parse, so sandbox
 * always fell back to a fixed S2. A cheap keyword heuristic keeps the
 * classification at least responsive to what the tester actually typed.
 *
 * E17-S6: the S4 branch reads `crisis-keywords.ts`, the one keyword list the
 * budget gate also uses — see that module for why a shared list matters.
 */
function buildCannedSafetyState(message: string): SafetyState {
  const lower = message.toLowerCase();
  if (hasCrisisLanguage(message)) return 'S4';
  if (/\b(harm myself|self[- ]harm|hurt myself|cutting)\b/.test(lower)) return 'S3';
  if (/\b(angry|furious|rage|hate|pissed)\b/.test(lower)) return 'S1';
  if (/\b(anxious|worried|scared|stressed|overwhelmed|nervous)\b/.test(lower)) return 'S1';
  return 'S0';
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
      crisis_language_detected: {
        type: 'BOOLEAN' as const,
      },
      basis: {
        type: 'STRING' as const,
      },
      signal_strength: {
        type: 'STRING' as const,
      },
      notes: {
        type: 'STRING' as const,
        nullable: true,
      },
    },
    required: ['safetyState', 'crisis_language_detected', 'basis', 'signal_strength'],
  };

  let result: { text: string; fallbackUsed: boolean; failureReason?: 'timeout' | 'api_error' };

  try {
    result = await generateContent({
      systemInstruction,
      contents,
      generationConfig: {
        // Deterministic classification (OKUVU v2.0 spec) — A1 previously had
        // no explicit temperature, inheriting the provider default of 0.7.
        temperature: 0.0,
        responseMimeType: 'application/json',
        responseSchema,
      },
      cannedResponse: JSON.stringify({
        safetyState: buildCannedSafetyState(input.message),
        crisis_language_detected: false,
        basis: 'literal',
        signal_strength: 'medium',
        notes: null,
      }),
    });
  } catch {
    console.error({ reason: 'llm_api_error' }, 'A1 safety classification failed');
    return fallbackOutput('llm_api_error');
  }

  if (result.fallbackUsed) {
    const reason = result.failureReason === 'timeout' ? 'llm_timeout' : 'llm_api_error';
    console.error({ reason }, 'A1 safety classification failed');
    return fallbackOutput(reason);
  }

  try {
    const parsed = JSON.parse(result.text);

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.safetyState === 'string' &&
      isValidSafetyState(parsed.safetyState) &&
      typeof parsed.crisis_language_detected === 'boolean' &&
      isValidBasis(parsed.basis) &&
      isValidSignalStrength(parsed.signal_strength) &&
      (parsed.notes === null || parsed.notes === undefined || typeof parsed.notes === 'string')
    ) {
      return {
        safetyState: parsed.safetyState,
        fallbackUsed: false,
        crisis_language_detected: parsed.crisis_language_detected,
        basis: parsed.basis,
        signal_strength: parsed.signal_strength,
        notes: parsed.notes ?? null,
      };
    }

    console.error({ reason: 'parse_failure', received: parsed?.safetyState ?? typeof parsed }, 'A1 safety classification failed');
    return fallbackOutput('parse_failure');
  } catch {
    console.error({ reason: 'parse_failure', text: result.text }, 'A1 safety classification failed — unparseable JSON');
    return fallbackOutput('parse_failure');
  }
}
