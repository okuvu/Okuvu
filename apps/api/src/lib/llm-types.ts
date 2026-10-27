/**
 * Provider-neutral types for a single LLM/embedding call.
 *
 * These types are the agent-facing contract: every agent builds a
 * `GenerateContentParams` and reads a `GenerateContentResult`, and
 * `generate-content.ts` picks the backend. They live in a module with no cloud
 * SDK import so the dispatcher stays import-safe for apps/test-harness, which
 * bundles these modules directly. Keeping the types in a module
 * with no cloud SDK in it is what lets the dispatcher stay import-safe for
 * `apps/test-harness`, which bundles these modules directly.
 */

export const DEFAULT_MAX_OUTPUT_TOKENS = 2048;
export const DEFAULT_TIMEOUT_MS = 30_000;

export interface GenerateContentParams {
  systemInstruction: string;
  contents: Array<{
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
  }>;
  timeoutMs?: number;
  model?: string;
  /**
   * Structured-generation constraints. `type` is the JSON-schema-ish token
   * agents use ('object', 'array', 'string', …); each backend maps it onto its
   * own schema dialect (Bedrock: lowercase JSON Schema types).
   */
  generationConfig?: {
    responseMimeType?: string;
    responseSchema?: Record<string, unknown>;
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    topK?: number;
    stopSequences?: string[];
    /**
     * Legacy Gemini-2.5 knob, carried only so callers that still set it (see
     * `agents/a9-post/agent.ts`) keep compiling. Neither AWS backend reads it:
     * Converse has no thinking-budget field (Nova's budget is `inferenceConfig`)
     * and OpenRouter/Llama has no equivalent — both `bedrock.ts` and
     * `openrouter.ts` document it as accepted-and-ignored. Do not use it for new
     * call sites.
     */
    thinkingConfig?: { thinkingBudget?: number };
  };
  /**
   * TH-S17 — per-call override for canned-response mode. When omitted, canned
   * mode is driven solely by the `USE_CANNED_LLM_RESPONSE` env var. Passing
   * `true`/`false` overrides the env var for this one call without mutating
   * `process.env` — this is what lets a caller (e.g. the test harness) request
   * a canned response for a single invocation.
   */
  useCanned?: boolean;
  /**
   * Schema-appropriate canned text for this specific call, supplied by the
   * calling agent. Without this every agent got the same generic SAFE_FALLBACK
   * prose in canned mode, which none of them can parse as their own expected
   * JSON shape.
   */
  cannedResponse?: string;
}

export interface GenerateContentResult {
  text: string;
  fallbackUsed: boolean;
  failureReason?: 'timeout' | 'api_error';
  /**
   * The bare model id this call resolved to (e.g. 'amazon.nova-pro-v1:0') —
   * present even in canned mode, reporting what *would* have been used.
   * Callers persisting this as provenance (e.g. Turn.model_version) must check
   * `canned` first and attribute nothing when it is true.
   */
  model: string;
  /** True when this result came from canned/test-hook text, not a real model call. */
  canned: boolean;
}
