import type { RouterInput, RouterDecision, SafetyState } from '@evia/shared-types'

const VALID_SAFETY_STATES: ReadonlySet<string> = new Set(['S0', 'S1', 'S2', 'S3', 'S4'])

function isValidSafetyState(value: unknown): value is SafetyState {
  return typeof value === 'string' && VALID_SAFETY_STATES.has(value)
}

export function routeTurn(input: RouterInput): RouterDecision {
  if (!input || !isValidSafetyState(input.safety_state)) {
    return { agent: 'crisis' }
  }

  if (input.safety_state === 'S4') {
    return { agent: 'crisis' }
  }

  if (input.safety_state === 'S3') {
    return { agent: 'A2', mode: 'grounding-only' }
  }

  if (input.session_count === 1 && input.turn_count === 1) {
    return { agent: 'A2', mode: 'alliance-building' }
  }

  return { agent: 'A2', mode: 'normal' }
}
