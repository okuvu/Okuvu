import type { SafetyState, GovernanceState, RouterDecision, CarePlanId } from '@okuvu/shared-types';

/**
 * TH-S09 — Mocked session context for single-agent invocation.
 *
 * Every therapy-pipeline agent normally receives its input as a function of
 * upstream pipeline state (safety state, governance state, router decision,
 * session/turn counters, care plan, retrieved context, etc). The test
 * harness lets a user invoke any one agent in isolation, so this module is
 * the single source of truth for "sensible defaults" for all of that
 * upstream state — every field is overridable via a partial input so a
 * tester can probe edge cases (e.g. S3 safety state, turn 5, CP2 care plan)
 * without hand-building a full context every time.
 */

export interface MockSessionContext {
  userId: string;
  message: string;
  safetyState: SafetyState;
  governanceState: GovernanceState;
  routerDecision: RouterDecision;
  retrievedContext: string | null;
  carePlan: CarePlanId;
  sessionCount: number;
  sessionNumber: number;
  turnNumber: number;
  sessionHistorySummary: string | null;
  perceivedIntensity: number | null;
  recentHistory: { role: 'user' | 'assistant'; content: string }[];
  sessionSummary: string | null;
  toolResultContext: string | undefined;
  userMemoryContext: string | null;
}

/** Prefix used for synthetic test-harness users, mirroring the
 *  `load-test-vu-` precedent in apps/api/src/lib/session-handler.ts. */
export const TEST_USER_PREFIX = 'test-user-';

export function defaultMockSessionContext(): MockSessionContext {
  return {
    userId: `${TEST_USER_PREFIX}default`,
    message: 'Hi, I have been feeling a bit overwhelmed lately.',
    safetyState: 'S0',
    governanceState: 'Active',
    routerDecision: { agent: 'A2', mode: 'normal' },
    retrievedContext: null,
    carePlan: 'CP1',
    sessionCount: 1,
    sessionNumber: 1,
    turnNumber: 1,
    sessionHistorySummary: null,
    perceivedIntensity: null,
    recentHistory: [],
    sessionSummary: null,
    toolResultContext: undefined,
    userMemoryContext: null,
  };
}

export function buildMockSessionContext(
  overrides: Partial<MockSessionContext> = {},
): MockSessionContext {
  return { ...defaultMockSessionContext(), ...overrides };
}
