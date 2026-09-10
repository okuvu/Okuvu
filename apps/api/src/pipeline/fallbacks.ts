export const A2_DEGRADED_RESPONSE =
  "I hear you, and I'm here to support you. " +
  "Could you tell me a bit more about what's going on right now?"

export const A9_POST_DEGRADED_RESPONSE =
  "I'm here with you. Take a breath — what's most on your mind right now?"

export const A9_POST_S2_FALLBACK =
  "I want to make sure I'm being helpful right now. " +
  "Can you tell me a bit more about what you're experiencing?"

export function getSafeFallback(safetyState: string): string {
  return safetyState === 'S2' ? A9_POST_S2_FALLBACK : A9_POST_DEGRADED_RESPONSE
}

// A9-pre (governance) rejected the message but A1 did not find crisis-level
// risk — this is the router's 'blocked' mode (a8-router.ts). Distinct from
// the crisis path: this always gets a real, persisted, non-alarming reply,
// never silence.
export const A9_PRE_BLOCKED_RESPONSE =
  "I want to keep our conversation within what I can safely help with here. " +
  "Let's take a step back — what would be most helpful for you right now?"

// OKUVU v2.0: A1 classified this turn S3 (elevated risk — hopelessness,
// worthlessness, or escape themes, without a stated plan or method). This is
// the router's 'deterministic-grounding' agent (a8-router.ts) — the same
// tier of clinical determinism as crisis (S4), one step down: A2 is skipped
// entirely, but this always gets a real, persisted, grounding-oriented
// reply, never silence. Content TBD by whoever owns crisis/grounding copy —
// same open item as A9_PRE_BLOCKED_RESPONSE and the crisis path's no-script
// gap.
export const A8_S3_GROUNDING_RESPONSE =
  "It sounds like things feel really heavy right now. Let's slow down together — " +
  "can you take a breath with me, and tell me what's around you right now?"
