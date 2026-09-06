/**
 * Provider-agnostic canned/test-hook short-circuit, shared by every real LLM
 * client (vertex-ai.ts, openrouter.ts). Sandbox/test behavior (no real model
 * call, deterministic reply) must be identical regardless of which provider
 * is actually configured — this logic used to live inline in vertex-ai.ts
 * only; extracted here so a second provider doesn't have to copy-paste it.
 */

export const SAFE_FALLBACK = "I'm here to support you. Could you tell me more about how you're feeling?";

export interface CannedCheckParams {
  /**
   * Optional per-call override for canned-response mode. When omitted,
   * canned mode is driven solely by the `USE_CANNED_LLM_RESPONSE` env var.
   * Passing `true`/`false` explicitly overrides the env var for this one
   * call only, without mutating `process.env`.
   */
  useCanned?: boolean;
  /**
   * Schema-appropriate canned text for this specific call, supplied by the
   * calling agent. Without this, every agent would get back the same
   * generic SAFE_FALLBACK prose in canned mode, which none of them can
   * parse as their own expected shape.
   */
  cannedResponse?: string;
}

export interface CannedResult {
  text: string;
  fallbackUsed: boolean;
  model: string;
  canned: true;
}

export function isCannedRequested(params: CannedCheckParams): boolean {
  return params.useCanned ?? process.env.USE_CANNED_LLM_RESPONSE === 'true';
}

/**
 * A canned reply is a deliberate simulated success, not a failure — mark
 * `fallbackUsed:false` whenever the caller supplied a real, schema-shaped
 * `cannedResponse` so downstream parsing treats it like a normal result.
 * Only the bare generic-prose default (no cannedResponse configured
 * anywhere) still reports itself as a fallback.
 */
export function buildCannedResult(params: CannedCheckParams, model: string): CannedResult {
  const text = params.cannedResponse ?? process.env.CANNED_LLM_RESPONSE ?? SAFE_FALLBACK;
  return {
    text,
    fallbackUsed: params.cannedResponse === undefined && process.env.CANNED_LLM_RESPONSE === undefined,
    model,
    canned: true,
  };
}
