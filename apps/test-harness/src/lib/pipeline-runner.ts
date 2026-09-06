import type { PipelineSignal } from '@evia/shared-types';
import { prisma } from './prisma';
import { TEST_USER_PREFIX } from './mock-context';
import { invokeAgent } from './agent-adapter';

// ─── Direct import of apps/api's real orchestrator ──────────────────────────
//
// TH-S18 spec: reuse the exact same relative-import pattern TH-S09's
// agent-adapter.ts already established for reaching into apps/api/src from
// apps/test-harness/src/lib (see agent-adapter.ts's comment block for why
// this works without apps/api being a declared workspace dependency).
import { processTurn } from '@evia/api/src/pipeline/orchestrator';
import type { PipelineResult, TestModeOptions } from '@evia/api/src/pipeline/types';

export type { PipelineResult, TestModeOptions };

/**
 * Per-agent trace entry assembled from `processTurn`'s existing `timing` +
 * `signals` arrays (TH-S10), plus the A13/A15 worker call's own timing.
 * `input` is intentionally `null` for the A1/A9-pre/A8/A2/A9-post stages:
 * `processTurn` does not surface each agent's raw request payload on
 * `PipelineResult` (only its output, via `signals`), so there is nothing
 * real to put there without re-deriving it ourselves — which the story
 * explicitly says not to do ("map this existing timing data ... do not
 * re-time agents yourself"). `output` is the matching signal's payload when
 * `captureSignalBus` produced one, else `null` (e.g. on the crisis path,
 * where only A1/A9-pre/A8 signals exist).
 */
export interface AgentTraceEntry {
  agentId: string;
  input: unknown;
  output: unknown;
  latencyMs: number;
  signals: PipelineSignal[];
}

export interface PipelineRunResult {
  result: PipelineResult;
  trace: AgentTraceEntry[];
  /** Agents that actually ran this turn, in pipeline order. */
  activatedAgents: string[];
}

/** Maps a `StageTiming.stage` value (real or `*_skipped`) to a TestAgentId. */
const STAGE_TO_AGENT: Record<string, string> = {
  A1: 'A1',
  A1_skipped: 'A1',
  A9_pre: 'A9-pre',
  A9_pre_skipped: 'A9-pre',
  A8_router: 'A8',
  A8_router_skipped: 'A8',
  A2_response: 'A2',
  A9_post: 'A9-post',
};

/** Maps a TestAgentId back to the `PipelineSignal.boundary` it produced. */
const AGENT_TO_BOUNDARY: Record<string, string> = {
  A1: 'A1_result',
  'A9-pre': 'A9_pre_result',
  A8: 'A8_decision',
  A2: 'A2_result',
  'A9-post': 'A9_post_result',
};

/**
 * Create a synthetic `test-user-*` User + a fresh SessionLog row so
 * `processTurn` (which reads/writes real Prisma rows) has something valid
 * to operate against. Mirrors the `TEST_USER_PREFIX` precedent from
 * singleAgentRouter.mockSessionContext (TH-S09), extended with a SessionLog
 * since `processTurn` — unlike single-agent invocation — needs a real
 * session to increment turn counts against and write Turn rows into.
 */
export async function setupSyntheticSession(): Promise<{
  uid: string;
  userId: string;
  sessionId: string;
}> {
  if (!prisma) {
    throw new Error('Database not configured — DATABASE_URL is unset.');
  }

  const firebaseUid = `${TEST_USER_PREFIX}pipeline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await prisma.user.upsert({
    where: { firebase_uid: firebaseUid },
    update: {},
    create: { firebase_uid: firebaseUid, phone_number: '+10000000000' },
  });

  const session = await prisma.sessionLog.create({
    data: { user_id: user.id },
  });

  return { uid: firebaseUid, userId: user.id, sessionId: session.id };
}

/**
 * Run the real end-to-end pipeline (A1 -> A9-pre -> A8 -> A2 -> A9-post via
 * `processTurn`), then follow it with the A13/A15 combined worker call
 * (reusing TH-S09's `invokeAgent` adapter rather than re-implementing the
 * `POST /tasks/summary` call), and assemble a combined per-agent trace.
 *
 * A13/A15 are skipped on the crisis path: `processTurn` returns before any
 * `Turn` rows exist, so there is no session content yet for a summary/memory
 * pass to summarize.
 */
export async function runFullPipeline(params: {
  uid: string;
  sessionId: string;
  message: string;
  perceivedIntensity?: number | null;
  testMode?: TestModeOptions;
}): Promise<PipelineRunResult> {
  const testMode: TestModeOptions = { ...params.testMode, captureSignalBus: true };

  const result = await processTurn(
    params.uid,
    params.sessionId,
    params.message,
    params.perceivedIntensity ?? null,
    { testMode },
  );

  const signals = result.signals ?? [];
  const trace: AgentTraceEntry[] = [];
  const activatedAgents: string[] = [];

  for (const stageTiming of result.timing) {
    const agentId = STAGE_TO_AGENT[stageTiming.stage];
    if (!agentId) continue; // e.g. 'validation', 'layer3_rag', 'total_turn' — not a pipeline agent

    if (!activatedAgents.includes(agentId)) activatedAgents.push(agentId);

    const boundary = AGENT_TO_BOUNDARY[agentId];
    const signal = signals.find((s) => s.boundary === boundary);

    trace.push({
      agentId,
      input: null,
      output: signal?.payload ?? null,
      latencyMs: stageTiming.elapsedMs,
      signals: signal ? [signal] : [],
    });
  }

  // A13/A15: one combined worker call (per TH-S09's finding that both run
  // via the same POST /tasks/summary endpoint), only attempted when a real
  // turn was actually written (i.e. not the crisis silence path).
  if (result.type === 'agent_turn') {
    const start = performance.now();
    const workerResult = await invokeAgent(
      'A13',
      { sessionId: params.sessionId, userId: params.uid },
      {},
    );
    const latencyMs = performance.now() - start;
    const output = workerResult.output as { error?: string };
    const succeeded = !output?.error;

    if (succeeded) {
      activatedAgents.push('A13', 'A15');
    }

    trace.push({
      agentId: 'A13+A15',
      input: { sessionId: params.sessionId, userId: params.uid },
      output: workerResult.output,
      latencyMs,
      signals: [],
    });
  }

  return { result, trace, activatedAgents };
}
