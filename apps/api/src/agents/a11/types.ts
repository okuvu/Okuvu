/**
 * A11 — Learning Optimiser.
 *
 * Internal analytics only. A11 aggregates *treatment* signal across a
 * specialist's caseload: does this specialist's work tend to move outcomes,
 * and do their clients stick to the plan? It answers those questions with
 * counts and means, never with prose, and never per client.
 *
 * Two constraints shape the types:
 *
 *  - there is no field for a client. A `SessionSignal` carries a clientId
 *    because the caller needs it to deduplicate check-ins; the output type has
 *    nowhere to put it, so an aggregate physically cannot leak a client.
 *  - there is no field for a recommendation. A11 measures; a human decides.
 *    Publishing "use this approach more" from five sessions would be a
 *    clinical judgement dressed as a statistic.
 */

export interface SessionSignal {
  sessionId: string;
  clientId: string;
  specialistId: string;
  weekIndex: number;
  /** Change in the outcome measure across the session. Non-finite values are excluded. */
  outcomeDelta: number;
  adheredToPlan: boolean;
}

export interface LearningAggregate {
  specialistId: string;
  /** Signals contributing to this aggregate, after non-finite deltas are excluded. */
  n: number;
  meanDelta: number | null;
  /** Fraction 0–1 of included signals that adhered to plan. */
  adherenceRate: number | null;
  /** True when n < minSample: the numbers are withheld, not estimated. */
  suppressed: boolean;
}

export interface A11Output {
  aggregates: LearningAggregate[];
  minSample: number;
  totalSessions: number;
  notes: string[];
}
