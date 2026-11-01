import type { RouterInput, RouterDecision, SafetyState } from '@okuvu/shared-types'
import { hasMedicalEmergencyLanguage } from './a1/medical-emergency-keywords.js'
import { hasThirdPartyCrisisLanguage } from './a1/crisis-keywords.js'

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
 *
 * E17-S9 — medical emergency (agent: 'medical-emergency'). This is the one
 * rule in this file that is not a function of the states, because the state is
 * not where the problem shows up: measured on the api task's own environment,
 * "I'm having chest pain and my left arm feels numb" classified S1 and "my
 * brother drank a whole bottle of whiskey and he's unconscious" classified S2
 * (evidence/E17-S5-orch-correction.md). A state-only router sends both to A2,
 * and A2 answers a medical emergency with the mental-health crisis card. So the
 * check is on the message, through the deterministic screen in
 * `a1/medical-emergency-keywords.ts` — the same tier of determinism as the
 * crisis keyword floor, no model involved.
 *
 * Why it is checked before S4, and why that is not a weakening of the crisis
 * path: `hasMedicalEmergencyLanguage` refuses to match any message that carries
 * self-harm or crisis wording (it calls `hasCrisisLanguage` first, plus an
 * explicit self-harm extension), so an explicit disclosure is never a medical
 * match and still lands on the crisis card at S4. What the ordering fixes is
 * the measured me-04 case — "I cut my hand badly and the bleeding won't stop"
 * — where A1 reads an accidental injury as active self-harm and returns S4, and
 * the user gets a mental-health card for an injury. A model-generated S4 on an
 * injury message is not a self-harm disclosure; an ambulance is the right
 * answer for it. Where A1 *does* still return S4 on a medical message, the
 * orchestrator serves the medical copy that keeps the crisis helplines in it
 * (MEDICAL_EMERGENCY_CRISIS_RESPONSE) and sets the crisis flag, so no resource
 * is withdrawn from that user.
 *
 * Also checked before governance: a policy Blocked verdict on a message
 * describing an unconscious relative must not replace the ambulance with a
 * static policy-boundary line.
 */
export function routeTurn(input: RouterInput): RouterDecision {
  if (!input) {
    return { agent: 'crisis' }
  }

  const safetyState = resolveSafetyState(input)

  if (!safetyState) {
    return { agent: 'crisis' }
  }

  if (input.message && hasMedicalEmergencyLanguage(input.message)) {
    return { agent: 'medical-emergency' }
  }

  // E17-S13 — someone else's risk, before S4. `CRISIS_RESPONSE` is second-person
  // copy, so an S4 turn that is really about a friend or a parent must not
  // receive it; `hasThirdPartyCrisisLanguage` returns false whenever the
  // message also carries a first-person disclosure, which keeps the crisis card
  // for the user themselves.
  if (input.message && hasThirdPartyCrisisLanguage(input.message)) {
    return { agent: 'crisis-third-party' }
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
