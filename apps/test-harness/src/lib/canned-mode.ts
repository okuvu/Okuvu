import type { TestEnvironment } from '@okuvu/shared-types';

/**
 * TH-S17 — sandbox runs should be free/deterministic by default: no live
 * Bedrock spend, no LLM nondeterminism, when a user is just exploring the
 * harness against the sandbox environment. Staging and beta are expected to
 * exercise the real model.
 */
export function shouldUseCanned(environment: TestEnvironment): boolean {
  return environment === 'sandbox';
}

/**
 * TH-S17 — thread a canned-response decision into a single agent
 * invocation without a permanent, process-wide env mutation.
 *
 * Why this exists: `apps/api/src/agents/a2/agent.ts`'s `handleTurn` (and the
 * other therapy-pipeline agents reached via
 * `apps/test-harness/src/lib/agent-adapter.ts`) call
 * `apps/api/src/lib/generate-content.ts`'s `generateContent()` internally and do
 * NOT expose a `useCanned` passthrough parameter on their own input types
 * (`A2Input`, `A1Input`, `GovernanceInput`, `A9PostInput` have no such
 * field). Even though `generateContent` itself now accepts an optional
 * `useCanned` param, there is no wiring
 * from `invokeAgent`'s caller down through `handleTurn` etc. to pass it —
 * doing that "properly" would mean adding a `useCanned` field to every
 * agent's input type and threading it through every internal
 * `generateContent` call site, which is a much larger change than this
 * story's scope allows (and touches files this story was told to leave
 * alone, like widening `agent-adapter.ts` input mapping for every agent).
 *
 * The pragmatic compromise: set `USE_CANNED_LLM_RESPONSE` (and, if a canned
 * response string was supplied, `CANNED_LLM_RESPONSE`) on `process.env`
 * immediately before invoking the agent, and restore the previous values in
 * a `finally` block immediately after. This is still a global env mutation
 * in the technical sense, but it is *scoped to the lifetime of a single
 * `await` call* rather than left set indefinitely — which is the specific
 * concern the story called out ("not a permanent global mutation... left
 * set forever"). It is not race-free against concurrent requests in the
 * same Node process (two overlapping sandbox+non-sandbox calls could race
 * on this env var), but the test harness's agent invocation is a low-QPS,
 * single-operator debugging tool, not a high-concurrency production path,
 * so this tradeoff is acceptable here and is documented rather than hidden.
 */
/**
 * Whether a run actually executed under canned mode — combining a deliberate
 * per-router decision (e.g. `conversation.ts`'s `shouldUseCanned(environment)`)
 * with a direct read of the ambient `USE_CANNED_LLM_RESPONSE` env var.
 *
 * The ambient check matters independently of any deliberate decision:
 * `pipeline.ts`/`corpus.ts` never call `shouldUseCanned`/`withCannedMode` at
 * all today — their runs go canned purely because the process-wide env var
 * happens to be set (locally, in a shared `.env`, or left over from another
 * test), regardless of which environment was selected. And even
 * `withCannedMode(false, fn)` does not clear a pre-existing ambient
 * `USE_CANNED_LLM_RESPONSE=true` — it only ever sets/restores it when
 * `useCanned` is true. So a staging/beta run can go silently canned in every
 * router today; this is the one place all three check for that.
 */
export function isCannedRunActive(deliberateUseCanned = false): boolean {
  return deliberateUseCanned || process.env.USE_CANNED_LLM_RESPONSE === 'true';
}

export async function withCannedMode<T>(
  useCanned: boolean,
  fn: () => Promise<T>,
  cannedResponse?: string,
): Promise<T> {
  if (!useCanned) {
    return fn();
  }

  const prevUseCanned = process.env.USE_CANNED_LLM_RESPONSE;
  const prevCannedResponse = process.env.CANNED_LLM_RESPONSE;

  process.env.USE_CANNED_LLM_RESPONSE = 'true';
  if (cannedResponse !== undefined) {
    process.env.CANNED_LLM_RESPONSE = cannedResponse;
  }

  try {
    return await fn();
  } finally {
    if (prevUseCanned === undefined) {
      delete process.env.USE_CANNED_LLM_RESPONSE;
    } else {
      process.env.USE_CANNED_LLM_RESPONSE = prevUseCanned;
    }
    if (prevCannedResponse === undefined) {
      delete process.env.CANNED_LLM_RESPONSE;
    } else {
      process.env.CANNED_LLM_RESPONSE = prevCannedResponse;
    }
  }
}
