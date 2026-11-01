/**
 * Transport-neutral request/response contract for the worker's LLM and
 * embedding calls.
 *
 * These types and limits used to live in a platform-SDK-specific module that
 * the AWS cutover (docs/AWS-CUTOVER-SPEC.md) deleted. They moved here so
 * `bedrock.ts`, `openrouter.ts`, `generate-content.ts` and the job code
 * (summary / memory extraction) share one shape with no cloud SDK in the type
 * graph.
 */

/** Worker-wide default output budget when a caller does not set one. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 1000;

/** Worker-wide default per-call budget (summary + memory jobs are interactive-ish). */
export const DEFAULT_TIMEOUT_MS = 25_000;

export interface GenerateContentParams {
  systemInstruction: string;
  contents: Array<{
    /** `model` is the assistant turn (kept for call-site compatibility). */
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
  }>;
  timeoutMs?: number;
  model?: string;
  generationConfig?: GenerationConfig;
}

export interface GenerationConfig {
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  responseMimeType?: string;
  /**
   * Schema the completion must satisfy. `bedrock.ts` turns it into a forced,
   * strict tool (`emit_structured_json`) and re-serialises the tool input as
   * the result text.
   */
  responseSchema?: Record<string, unknown>;
}

export interface GenerateContentResult {
  text: string;
  fallbackUsed: boolean;
  failureReason?: 'timeout' | 'api_error';
  /**
   * E17-S4 — 'timeout' | 'throttled' | 'unavailable', mirroring the api's
   * `lib/llm-failure.ts` so the two deployables classify a failure the same way.
   */
  failureKind?: 'timeout' | 'throttled' | 'unavailable';
}

/**
 * E17-S4 — the fallback sentence a failed call returns instead of ''.
 *
 * Deliberately identical to `apps/api/src/lib/canned-response.ts`'s
 * `SAFE_FALLBACK`. The duplication is the same one the rest of `llm-types.ts`
 * carries: `apps/api` and `apps/worker` are separate deployables that share
 * only `packages/prisma` and `packages/shared-types`, so this cannot be a
 * cross-app import. The point of the change is that an empty string was not a
 * conservative value — it was an absence that every caller had to remember to
 * check, and `bedrock.test.ts` asserted it as the contract. A sentence is the
 * fail-closed value: it can be logged, shown, and cannot be mistaken for a
 * summary.
 */
export const SAFE_FALLBACK = "I'm here to support you. Could you tell me more about how you're feeling?";
