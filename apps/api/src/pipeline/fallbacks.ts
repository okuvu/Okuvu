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
