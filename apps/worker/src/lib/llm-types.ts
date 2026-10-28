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
}
