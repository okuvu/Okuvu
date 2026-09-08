import type { GovernanceState, RouterDecision, SafetyState, TestAgentId } from '@okuvu/shared-types';
import type { MockInput } from '@/lib/dependency-graph';

/**
 * The values a user fills in via MockModePanel for whichever `MockInput`s
 * `dependency-graph.ts`'s `mockModeFor(agent)` says are required.
 */
export interface MockValues {
  safetyState?: SafetyState;
  governanceState?: GovernanceState;
  routerDecision?: RouterDecision;
  retrievedContext?: string;
}

/**
 * Maps a mock-panel value to the matching `testMode.inject*` field consumed
 * by `pipeline.runFullPipeline` (see apps/test-harness/src/server/routers/pipeline.ts's
 * testModeInputSchema) — a straight 1:1 label mapping, not dependency logic.
 */
export function buildTestModeFromMockValues(values: MockValues): {
  injectA1?: SafetyState;
  injectA9?: GovernanceState;
  injectRouter?: RouterDecision;
  injectRetrievedContext?: string;
} {
  return {
    injectA1: values.safetyState,
    injectA9: values.governanceState,
    injectRouter: values.routerDecision,
    injectRetrievedContext: values.retrievedContext,
  };
}

/**
 * Which pipeline agent `orchestrator.ts` actually skips (see its `*_skipped`
 * timing stages) when a given `MockInput` is supplied. `retrievedContext`
 * intentionally has no entry here: `injectRetrievedContext` only overrides
 * the Layer-3 RAG call, it does not skip a whole pipeline agent stage.
 */
export const MOCK_INPUT_TO_SKIPPED_AGENT: Partial<Record<MockInput, TestAgentId>> = {
  safetyState: 'A1',
  governanceState: 'A9-pre',
  routerDecision: 'A8',
};

export const MOCK_INPUT_LABELS: Record<MockInput, string> = {
  safetyState: 'Safety state (A1 output)',
  governanceState: 'Governance state (A9-pre output)',
  routerDecision: 'Router decision (A8 output)',
  retrievedContext: 'Retrieved context (RAG)',
};

/**
 * Given the set of MockInputs the panel actually collected non-empty values
 * for, compute which upstream agents were bypassed — directly from which
 * `MOCK_INPUT_TO_SKIPPED_AGENT` entries apply, matching orchestrator.ts's
 * real skip behavior exactly (rather than guessing via a transitive-closure
 * computation).
 */
export function skippedAgentsForMockValues(values: MockValues): Set<TestAgentId> {
  const skipped = new Set<TestAgentId>();
  if (values.safetyState !== undefined) skipped.add('A1');
  if (values.governanceState !== undefined) skipped.add('A9-pre');
  if (values.routerDecision !== undefined) skipped.add('A8');
  return skipped;
}
