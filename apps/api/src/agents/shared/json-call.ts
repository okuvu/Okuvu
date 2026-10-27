import { generateContent } from '../../lib/generate-content.js';

/**
 * One strict-JSON call path for every agent added in the 15-agent expansion
 * (A3–A7, A10, A12–A15).
 *
 * Why this exists rather than each agent repeating A1's parse block: A1, A2 and
 * A9 each hand-roll "call model → JSON.parse → validate every enum → fail
 * closed", and the three copies have already drifted (A1 validates `notes`
 * type, A9 does not). A safety-critical pipeline cannot afford a fourth and
 * fifth divergent copy, so the new agents share this one and A1/A2/A9 can be
 * back-ported onto it later without changing their behaviour.
 *
 * Two properties are deliberate and must not be "simplified" later:
 *
 *  1. `responseSchema` is only enforced by the Vertex/Gemini path. Under
 *     OpenRouter (the default provider) it is silently dropped and only
 *     `response_format: json_object` is sent — so the model can return any
 *     JSON at all. Every field is therefore re-validated here, never assumed.
 *  2. Every failure (timeout, API error, unparseable JSON, schema violation)
 *     routes to `onFailure`, which each caller implements as its most
 *     conservative state. A technical failure must never read as a confident
 *     clinical judgement.
 */

export type JsonFailureReason =
  | 'llm_timeout'
  | 'llm_api_error'
  | 'parse_failure'
  | 'schema_invalid';

export interface JsonCallParams<T> {
  /** Agent id used in logs, e.g. 'A3'. */
  agent: string;
  systemInstruction: string;
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
  /** Vertex-only structured-output hint. See property 1 above. */
  schema: Record<string, unknown>;
  required: string[];
  /** Schema-shaped canned reply so sandbox mode exercises the real parser. */
  cannedResponse: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  /** Return the typed value, or null when the parsed object violates the contract. */
  validate: (parsed: Record<string, unknown>) => T | null;
  /** Most conservative value for this agent on any technical failure. */
  onFailure: (reason: JsonFailureReason) => T;
}

export interface JsonCallResult<T> {
  value: T;
  fallbackUsed: boolean;
  failureReason: JsonFailureReason | null;
  rawText: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function callJson<T>(params: JsonCallParams<T>): Promise<JsonCallResult<T>> {
  const fail = (reason: JsonFailureReason): JsonCallResult<T> => {
    console.error({ agent: params.agent, reason }, `${params.agent} call failed`);
    return { value: params.onFailure(reason), fallbackUsed: true, failureReason: reason, rawText: null };
  };

  let result: Awaited<ReturnType<typeof generateContent>>;

  try {
    result = await generateContent({
      systemInstruction: params.systemInstruction,
      contents: params.contents,
      generationConfig: {
        // Deterministic extraction/classification, same as A1. An agent that
        // paraphrases at temperature 0.7 is an agent whose output cannot be
        // regression-tested against a schema.
        temperature: params.temperature ?? 0.0,
        responseMimeType: 'application/json',
        responseSchema: params.schema,
        ...(params.maxOutputTokens ? { maxOutputTokens: params.maxOutputTokens } : {}),
      },
      cannedResponse: params.cannedResponse,
      ...(params.timeoutMs ? { timeoutMs: params.timeoutMs } : {}),
    });
  } catch {
    return fail('llm_api_error');
  }

  if (result.fallbackUsed) {
    return fail(result.failureReason === 'timeout' ? 'llm_timeout' : 'llm_api_error');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.text);
  } catch {
    console.error({ agent: params.agent, reason: 'parse_failure' }, `${params.agent} returned unparseable JSON`);
    return {
      value: params.onFailure('parse_failure'),
      fallbackUsed: true,
      failureReason: 'parse_failure',
      rawText: result.text,
    };
  }

  if (!isRecord(parsed)) {
    console.error({ agent: params.agent, reason: 'schema_invalid', received: typeof parsed }, `${params.agent} returned non-object JSON`);
    return {
      value: params.onFailure('schema_invalid'),
      fallbackUsed: true,
      failureReason: 'schema_invalid',
      rawText: result.text,
    };
  }

  const missing = params.required.filter((key) => !(key in parsed));
  if (missing.length > 0) {
    console.error({ agent: params.agent, reason: 'schema_invalid', missing }, `${params.agent} omitted required fields`);
    return {
      value: params.onFailure('schema_invalid'),
      fallbackUsed: true,
      failureReason: 'schema_invalid',
      rawText: result.text,
    };
  }

  const validated = params.validate(parsed);
  if (validated === null) {
    console.error({ agent: params.agent, reason: 'schema_invalid' }, `${params.agent} violated its output contract`);
    return {
      value: params.onFailure('schema_invalid'),
      fallbackUsed: true,
      failureReason: 'schema_invalid',
      rawText: result.text,
    };
  }

  return { value: validated, fallbackUsed: false, failureReason: null, rawText: result.text };
}

// ─── Field validators shared by every agent output contract ───────────────

export function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

export function isEnum<T extends string>(value: unknown, allowed: ReadonlySet<string>): value is T {
  return typeof value === 'string' && allowed.has(value);
}

export function asTrimmedString(value: unknown, maxChars: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, maxChars);
}

export function asOptionalTrimmedString(value: unknown, maxChars: number): string | null {
  if (value === null || value === undefined) return null;
  return asTrimmedString(value, maxChars);
}

/**
 * String arrays are where models pad: 9 "evidence" bullets that restate the
 * thought, or one 900-character paragraph pretending to be a list. Cap the
 * count and the per-item length, and reject the whole field rather than
 * silently truncating into a payload that looks clinically considered.
 */
export function asStringList(value: unknown, maxItems: number, maxChars: number): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > maxItems) return null;
  const out: string[] = [];
  for (const item of value) {
    const str = asTrimmedString(item, maxChars);
    if (str === null) return null;
    out.push(str);
  }
  return out;
}
