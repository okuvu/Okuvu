import type { RouterInput, RouterDecision, SafetyState, GovernanceState } from '@evia/shared-types'

const VALID_SAFETY_STATES: ReadonlySet<string> = new Set(['S0', 'S1', 'S2', 'S3', 'S4'])

function isValidSafetyState(value: unknown): value is SafetyState {
  return typeof value === 'string' && VALID_SAFETY_STATES.has(value)
}

function resolveGovernanceState(input: RouterInput): { safetyState: SafetyState | null; governanceState: GovernanceState | null } {
  const safetyState = isValidSafetyState(input.safety_state) ? input.safety_state : null

  if (input.governance_state === 'Blocked') {
    return { safetyState: 'S4', governanceState: 'Blocked' }
  }

  return { safetyState, governanceState: input.governance_state ?? null }
}

export function routeTurn(input: RouterInput): RouterDecision {
  if (!input) {
    return { agent: 'crisis' }
  }

  const { safetyState, governanceState } = resolveGovernanceState(input)

  if (!safetyState) {
    return { agent: 'crisis' }
  }

  if (safetyState === 'S4') {
    return { agent: 'crisis' }
  }

  if (safetyState === 'S3') {
    return { agent: 'A2', mode: 'grounding-only' }
  }

  if (input.session_count === 1 && input.turn_count === 1) {
    return { agent: 'A2', mode: 'alliance-building' }
  }

  if (governanceState === 'Restricted') {
    return { agent: 'A2', mode: 'grounding-only' }
  }

  return { agent: 'A2', mode: 'normal' }
}
