/**
 * Bedrock service tier for one call (E17-S6 cost work).
 *
 * Two discounts exist on this account and they behave differently:
 *
 *  • Service tier — `flex` prices the SAME model at roughly half the standard
 *    rate in ap-south-1. It carries no latency guarantee and the service may
 *    refuse the work when capacity is short. That is acceptable for a
 *    conversational turn and unacceptable for a safety decision, so the tier
 *    is chosen per call role, never globally.
 *
 *  • Region — cheaper in us-east-1/us-west-2, but moving the model is a
 *    published client promise and a per-region profile choice, not a knob.
 *
 * The rule this module encodes (agreed with the product owner):
 *
 *    safety  → standard. The gate decides whether a turn is a crisis, and a
 *              queued classifier is a delayed crisis response. It is also the
 *              cheapest call in the pipeline (~2.9k prompt tokens), so there is
 *              almost nothing to save and everything to lose.
 *    review  → standard. A9-post gates what the client actually reads; a late
 *              review either delays the reply or gets skipped.
 *    dialogue→ flex. A2 is 61% of the prompt bill and a client waiting a beat
 *              longer on a supportive reply is not the same risk as a queued
 *              crisis classifier.
 *    background → flex. Summaries and memory writes have no reader waiting.
 *
 * `OKUVU_BEDROCK_FLEX=true` is the only switch. Unset means every call is
 * standard — i.e. the pre-existing behaviour is the default, and turning this
 * on is a deliberate deploy-time decision.
 */

export type BedrockServiceTier = 'default' | 'flex' | 'priority';

/**
 * What this call is for. Required rather than optional on purpose: a new call
 * site that forgets to classify itself lands on `standard` (the safe, existing
 * behaviour) instead of silently joining the half-price queue.
 */
export type CallRole = 'safety' | 'review' | 'dialogue' | 'background';

/** No reader is waiting on these roles, so they may take the slow lane. */
const FLEX_ELIGIBLE: ReadonlySet<CallRole> = new Set<CallRole>(['dialogue', 'background']);

export interface ServiceTierDecision {
  tier: BedrockServiceTier;
  /** Logged with the call, never shown to a user. */
  reason: string;
}

export function decideServiceTier(
  role: CallRole | undefined,
  env: NodeJS.ProcessEnv = process.env,
): ServiceTierDecision {
  if (!role) {
    return { tier: 'default', reason: 'unclassified_call_site' };
  }

  if (env.OKUVU_BEDROCK_FLEX !== 'true') {
    return { tier: 'default', reason: 'flex_disabled' };
  }

  if (!FLEX_ELIGIBLE.has(role)) {
    return { tier: 'default', reason: `role_${role}_guaranteed` };
  }

  return { tier: 'flex', reason: `role_${role}_no_reader_waiting` };
}

/**
 * How long a flex call may sit in the queue before the caller gives up and
 * re-runs on the guaranteed lane.
 *
 * The product decision was "about twenty seconds": long enough to absorb a
 * normal queue delay, short enough that a client is not left reading a typing
 * indicator that will never resolve. The retry is paid for twice (the abandoned
 * attempt is still billed), which is why the timeout is measured rather than
 * assumed — see evidence/E17-S6.md.
 */
export const DEFAULT_FLEX_TIMEOUT_MS = 20_000;
