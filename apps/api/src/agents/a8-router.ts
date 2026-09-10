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
 * safety-risk determination. Deterministic grounding (agent:
 * 'deterministic-grounding') is reserved exclusively for A1 = S3 — the same
 * tier of clinical determinism, one step down: A2 is skipped, but a real,
 * persisted reply is still sent (never the crisis silence path). Governance
 * ('Blocked' from A9-pre) is a separate, policy-level decision and must
 * never be coerced into either safety path: crisis silently drops the turn
 * with no response and no persisted record, which is the wrong outcome for
 * a policy disagreement (e.g. an angry or off-topic message) — and, worse,
 * makes a real crisis indistinguishable from a false one in every downstream
 * log. Both S4 and S3 are checked before governance for the same reason: a
 * policy-level Blocked verdict must never downgrade a clinically elevated
 * user to a static policy-boundary reply. A Blocked verdict at any other
 * (S0-S2) safety state routes to A2 in 'blocked' mode instead: a real,
 * persisted turn with a static policy-boundary response, never silence.
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

  if (safetyState === 'S3') {
    return { agent: 'deterministic-grounding' }
  }

  if (input.governance_state === 'Blocked') {
    return { agent: 'A2', mode: 'blocked' }
  }

  return { agent: 'A2', mode: 'normal' }
}
