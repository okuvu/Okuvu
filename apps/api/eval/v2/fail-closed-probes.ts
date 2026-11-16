/**
 * The fail-closed probes, extracted so the runner and a test can share one
 * definition of which governed substitute a probe is supposed to serve.
 *
 * ## Why this is a module rather than a function inside the runner
 *
 * A `mode: "failclosed"` scenario is the one kind of judgement in the gate that
 * does not depend on a model: the served text is a constant in
 * `src/pipeline/fallbacks.ts`, chosen deterministically from the probe's kind and
 * declared safety state. That makes the rubric over it checkable *without*
 * calling a judge — if a scenario's `must_include` phrases appear nowhere in the
 * text the probe serves, the scenario can only pass by the judge being lenient
 * past its own instructions.
 *
 * That is exactly how `fc-05` sat failing three of three repetitions for the
 * life of the v2 gate while every neighbouring scenario testing the same
 * constant passed: its accepted phrases were the promise-family copy
 * ("right here with you", "not going anywhere") that the clinical lead struck
 * from every failure path in the rev 6 sign-off. The product was serving the
 * signed text; the rubric was still asking for the text she had removed. A test
 * that imports this module sees the same mapping the runner uses, so the two
 * cannot drift apart the way the rubric and the copy did.
 *
 * `classifierKind` is threaded through only so the routing detail string can
 * name the classification the real Claude/Converse error produced; it does not
 * change which constant is served.
 */
import { hasCrisisLanguage } from '../../src/agents/a1/crisis-keywords.js';
import {
  CRISIS_RESPONSE,
  SAFETY_UNAVAILABLE_RESPONSE,
  getModelUnavailableFallback,
} from '../../src/pipeline/fallbacks.js';

import type { Scenario } from './types.js';

export interface FailClosedSelection {
  served: string;
  detail: string;
}

export function runFailClosedProbe(scenario: Scenario, classifierKind: string): FailClosedSelection {
  const probe = scenario.probe!;
  if (probe.kind === 'classifier_unavailable') {
    const crisisFloorMatched = hasCrisisLanguage(probe.message);
    const state = crisisFloorMatched ? 'S4' : 'S2';
    if (crisisFloorMatched) {
      return { served: CRISIS_RESPONSE, detail: `a1 unavailable, crisis floor matched (${state}) -> crisis path` };
    }
    return { served: SAFETY_UNAVAILABLE_RESPONSE, detail: `a1 unavailable, no crisis language (${state}) -> static substitute, A2 not called` };
  }
  if (probe.kind === 'model_throttled') {
    return {
      served: getModelUnavailableFallback(probe.safety_state ?? 'S0'),
      detail: `classifier=throttled (simulated ThrottlingException) kind=${classifierKind} state=${probe.safety_state} -> getModelUnavailableFallback`,
    };
  }
  return {
    served: getModelUnavailableFallback(probe.safety_state ?? 'S0'),
    detail: `real Converse error classified as ${classifierKind} state=${probe.safety_state} -> getModelUnavailableFallback`,
  };
}
