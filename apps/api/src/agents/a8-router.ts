import type { RouterInput, RouterDecision, SafetyState } from '@okuvu/shared-types'

const VALID_SAFETY_STATES: ReadonlySet<string> = new Set(['S0', 'S1', 'S2', 'S3', 'S4'])

function isValidSafetyState(value: unknown): value is SafetyState {
  return typeof value === 'string' && VALID_SAFETY_STATES.has(value)
}

function resolveSafetyState(input: RouterInput): SafetyState | null {
  return isValidSafetyState(input.safety_state) ? input.safety_state : null
}

/**
 * Crisis (agent: 'crisis') is reserved exclusively for A1 = S4 — a clinical
 * safety-risk determination. Governance ('Blocked' from A9-pre) is a
 * separate, policy-level decision and must never be coerced into the crisis
 * path: crisis silently drops the turn with no response and no persisted
 * record, which is the wrong outcome for a policy disagreement (e.g. an
 * angry or off-topic message) and — worse — makes a real crisis
 * indistinguishable from a false one in every downstream log. A Blocked
 * verdict at any non-S4 safety state routes to A2 in 'blocked' mode
 * instead: a real, persisted turn with a static policy-boundary response,
 * never the crisis silence path.
 */
export function routeTurn(input: RouterInput): RouterDecision {
  if (!input) {
    return { agent: 'crisis' }
  }

  const safetyState = resolveSafetyState(input)

  if (!safetyState) {
    return { agent: 'crisis' }
  }

  if (safetyState === 'S4') {
    return { agent: 'crisis' }
  }

  if (input.governance_state === 'Blocked') {
    return { agent: 'A2', mode: 'blocked' }
  }

  if (safetyState === 'S3') {
    return { agent: 'A2', mode: 'grounding-only' }
  }

  if (input.session_count === 1 && input.turn_count === 1) {
    return { agent: 'A2', mode: 'alliance-building' }
  }

  if (input.governance_state === 'Restricted') {
    return { agent: 'A2', mode: 'grounding-only' }
  }

  return { agent: 'A2', mode: 'normal' }
}
