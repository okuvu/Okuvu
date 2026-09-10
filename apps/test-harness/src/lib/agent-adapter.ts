import type { TestAgentId } from '@okuvu/shared-types';
import { buildMockSessionContext, type MockSessionContext } from './mock-context';
import { getEnv } from './env';
import { withCannedMode } from './canned-mode';

// ─── Direct import of apps/api agent functions ─────────────────────────────
//
// TH-S09 spec: "Try direct import first." We did — `pnpm tsc --noEmit`
// succeeds with these relative imports into apps/api/src/agents/*, and none
// of the imported modules perform module-scope side effects that require
// credentials (the Vertex AI client in apps/api/src/lib/vertex-ai.ts is
// lazily constructed inside a function, not at import time), so importing
// these files does not itself crash a test-harness process without GCP
// credentials configured — an actual agent invocation that reaches Vertex AI
// will fail at call time instead, which is caught and surfaced below.
//
// apps/api is NOT declared as a workspace dependency of @okuvu/test-harness
// (its package.json has no "@okuvu/api" entry), so these are plain relative
// filesystem imports rather than a package import. Node/TS resolves the
// imported files' own dependencies (e.g. @google-cloud/aiplatform) starting
// from apps/api/node_modules, which pnpm populates independently of
// apps/test-harness/node_modules, so resolution works without adding
// apps/api to `transpilePackages`.
import { classifySafety } from '@okuvu/api/src/agents/a1/agent';
import type { A1Input } from '@okuvu/api/src/agents/a1/types';
import { classifyGovernance } from '@okuvu/api/src/agents/a9/agent';
import type { GovernanceInput } from '@okuvu/api/src/agents/a9/types';
import { routeTurn } from '@okuvu/api/src/agents/a8-router';
import { handleTurn } from '@okuvu/api/src/agents/a2/agent';
import type { A2Input } from '@okuvu/api/src/agents/a2/types';
import { a9PostReview } from '@okuvu/api/src/agents/a9-post/agent';
import type { A9PostInput } from '@okuvu/api/src/agents/a9-post/types';

export interface AgentInvocationResult {
  output: unknown;
  latencyMs: number;
  mockMode: boolean;
}

/**
 * A13 (session summary) and A15 (memory extraction) do not exist as
 * standalone agents in apps/api — they live in apps/worker, and memory
 * extraction runs *internally inside* generateSessionSummary (see
 * apps/worker/src/lib/summary.ts). There is no separate A15 HTTP endpoint.
 * The only relevant worker route is `POST /tasks/summary`
 * (apps/worker/src/routes/summary.ts), which is OIDC-protected and triggers
 * generateSessionSummary. So invoking either "A13" or "A15" from the test
 * harness makes this same combined call — the response covers both summary
 * generation and memory extraction together. This is surfaced explicitly in
 * the output (`combinedCall: true`, `note`) so the UI can label it clearly.
 */
async function invokeWorkerSummaryTask(
  sessionId: string,
  userId: string,
): Promise<{ processed: boolean; status?: string; combinedCall: true; note: string; error?: string }> {
  const note =
    'A13 (summary) and A15 (memory) are combined in apps/worker: memory extraction ' +
    'runs internally inside generateSessionSummary. This call invokes ' +
    'POST /tasks/summary, which covers both.';

  const env = getEnv();
  const workerUrl = env.WORKER_URL;
  if (!workerUrl) {
    return {
      processed: false,
      combinedCall: true,
      note,
      error: 'WORKER_URL is not configured — cannot reach apps/worker from this environment.',
    };
  }

  try {
    const res = await fetch(`${workerUrl.replace(/\/$/, '')}/tasks/summary`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, user_id: userId }),
    });

    if (!res.ok) {
      // Most likely cause in local/test environments: the route is
      // OIDC-protected (verifyOidcToken) and we have no valid ID token to
      // present, so this is expected to fail outside of a fully
      // credentialed deployment. Surface it as a result, not a throw.
      const body = await res.text().catch(() => '');
      return {
        processed: false,
        combinedCall: true,
        note,
        error: `Worker responded ${res.status}: ${body || res.statusText}`,
      };
    }

    const json = (await res.json()) as { processed: boolean; status?: string };
    return { ...json, combinedCall: true, note };
  } catch (err) {
    return {
      processed: false,
      combinedCall: true,
      note,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function toA1Input(ctx: MockSessionContext, overrides: Record<string, unknown>): A1Input {
  return {
    message: (overrides.message as string) ?? ctx.message,
    recentHistory:
      (overrides.recentHistory as A1Input['recentHistory']) ?? ctx.recentHistory,
  };
}

function toGovernanceInput(
  ctx: MockSessionContext,
  overrides: Record<string, unknown>,
): GovernanceInput {
  return {
    userId: (overrides.userId as string) ?? ctx.userId,
    message: (overrides.message as string) ?? ctx.message,
  };
}

function toA2Input(ctx: MockSessionContext, overrides: Record<string, unknown>): A2Input {
  return {
    userId: (overrides.userId as string) ?? ctx.userId,
    message: (overrides.message as string) ?? ctx.message,
    carePlan: (overrides.carePlan as A2Input['carePlan']) ?? ctx.carePlan,
    safetyState: (overrides.safetyState as A2Input['safetyState']) ?? (ctx.safetyState as A2Input['safetyState']),
    sessionHistorySummary:
      (overrides.sessionHistorySummary as string | null) ?? ctx.sessionHistorySummary,
    perceivedIntensity:
      (overrides.perceivedIntensity as number | null) ?? ctx.perceivedIntensity,
    recentHistory: (overrides.recentHistory as A2Input['recentHistory']) ?? ctx.recentHistory,
    sessionSummary: (overrides.sessionSummary as string | null | undefined) ?? ctx.sessionSummary,
    toolResultContext: (overrides.toolResultContext as string | undefined) ?? ctx.toolResultContext,
    userMemoryContext:
      (overrides.userMemoryContext as string | null | undefined) ?? ctx.userMemoryContext,
    retrievedContext:
      (overrides.retrievedContext as string | null | undefined) ?? ctx.retrievedContext,
    // OKUVU v2.0 additions — degrade gracefully to safe defaults, same as
    // the real orchestrator does until the therapist-portal/homework/tool-id
    // workstreams exist.
    therapistName: (overrides.therapistName as string | null | undefined) ?? null,
    carePlanFocus: (overrides.carePlanFocus as string | null | undefined) ?? null,
    homework: (overrides.homework as string | null | undefined) ?? null,
    toolkit: (overrides.toolkit as string[] | undefined) ?? [],
    languageMode: (overrides.languageMode as A2Input['languageMode']) ?? 'english',
  };
}

function toA9PostInput(ctx: MockSessionContext, overrides: Record<string, unknown>): A9PostInput {
  return {
    draftResponse: (overrides.draftResponse as string) ?? ctx.message,
    safetyState: (overrides.safetyState as string) ?? ctx.safetyState,
    carePlan: (overrides.carePlan as string) ?? ctx.carePlan,
  };
}

/**
 * Invoke a single therapy-pipeline agent in isolation, using the mock
 * session context defaults for any fields the caller did not supply.
 *
 * A8 (router) is synchronous and pure — no LLM call, no await, no timeout
 * wrapper. Everything else is async and calls out to Vertex AI (A1, A2, A9,
 * A9-post) or the worker service (A13/A15).
 */
export async function invokeAgent(
  agentId: TestAgentId,
  input: Record<string, unknown>,
  contextOverrides: Partial<MockSessionContext> = {},
  // TH-S17: when true, the LLM-calling agents below run with
  // USE_CANNED_LLM_RESPONSE scoped to just this call — see
  // apps/test-harness/src/lib/canned-mode.ts for why this is a scoped env
  // mutation rather than a per-call param threaded through handleTurn/etc.
  useCanned = false,
): Promise<AgentInvocationResult> {
  const ctx = buildMockSessionContext(contextOverrides);
  const start = performance.now();

  return withCannedMode(useCanned, () => invokeAgentInner(agentId, input, ctx, start));
}

async function invokeAgentInner(
  agentId: TestAgentId,
  input: Record<string, unknown>,
  ctx: MockSessionContext,
  start: number,
): Promise<AgentInvocationResult> {
  switch (agentId) {
    case 'A1': {
      const output = await classifySafety(toA1Input(ctx, input));
      return { output, latencyMs: performance.now() - start, mockMode: true };
    }
    case 'A9-pre': {
      const output = await classifyGovernance(toGovernanceInput(ctx, input));
      return { output, latencyMs: performance.now() - start, mockMode: true };
    }
    case 'A8': {
      // Synchronous, pure — deliberately not awaited/timeout-wrapped.
      const output = routeTurn({
        safety_state: (input.safety_state as never) ?? ctx.safetyState,
        governance_state: (input.governance_state as never) ?? ctx.governanceState,
        session_count: (input.session_count as number) ?? ctx.sessionCount,
        turn_count: (input.turn_count as number) ?? ctx.turnNumber,
      });
      return { output, latencyMs: performance.now() - start, mockMode: true };
    }
    case 'A2': {
      const output = await handleTurn(toA2Input(ctx, input));
      return { output, latencyMs: performance.now() - start, mockMode: true };
    }
    case 'A9-post': {
      const output = await a9PostReview(toA9PostInput(ctx, input));
      return { output, latencyMs: performance.now() - start, mockMode: true };
    }
    case 'A13':
    case 'A15': {
      const sessionId = (input.sessionId as string) ?? (input.session_id as string) ?? 'test-harness-session';
      const userId = (input.userId as string) ?? (input.user_id as string) ?? ctx.userId;
      const output = await invokeWorkerSummaryTask(sessionId, userId);
      return { output, latencyMs: performance.now() - start, mockMode: true };
    }
    case 'A10A': {
      throw new Error('A10A is not part of TH-S09 single-agent invocation scope.');
    }
    default: {
      const _exhaustive: never = agentId;
      throw new Error(`Unknown agentId: ${String(_exhaustive)}`);
    }
  }
}
