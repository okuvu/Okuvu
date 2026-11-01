/**
 * Provider-agnostic canned/test-hook short-circuit, shared by every real LLM
 * client (bedrock.ts, openrouter.ts). Sandbox/test behavior (no real model
 * call, deterministic reply) must be identical regardless of which provider is
 * actually configured, so it lives here rather than being copy-pasted per
 * provider.
 */

import { SAFETY_UNAVAILABLE_RESPONSE } from '../pipeline/fallbacks.js';

/**
 * E17-S7 rev 6 §4.10 — `SAFE_FALLBACK` is gone.
 *
 * It used to be a generic supportive line that ended in a diagnostic question
 * ("...tell me more about how you're feeling?"), and it was a sentinel *and*
 * copy: the text a failed provider call returned instead of '', and the default
 * in canned mode. That exact sentence appears nowhere in the code now, and a
 * test in __tests__/approved-copy.test.ts greps for it to keep it that way. The clinical
 * authority rejected that string outright — a diagnostic question asked of
 * someone who may have just disclosed a crisis — and instructed that it be
 * removed from the code entirely, not just from the active paths.
 *
 * What replaces it is not a new sentence: the failure path now returns the
 * approved `SAFETY_UNAVAILABLE_RESPONSE` text (§4.8), which admits that the
 * safety check could not run and names her helpline block. If it ever leaks to
 * a user it is copy she signed, and if it does not, it is still honest in a log.
 */

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
   * generic safety-unavailable prose in canned mode, which none of them can
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
  const text = params.cannedResponse ?? process.env.CANNED_LLM_RESPONSE ?? SAFETY_UNAVAILABLE_RESPONSE;
  return {
    text,
    fallbackUsed: params.cannedResponse === undefined && process.env.CANNED_LLM_RESPONSE === undefined,
    model,
    canned: true,
  };
}
