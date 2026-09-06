import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import type { CloseReason } from '@evia/shared-types';
import { protectedProcedure, router } from '../trpc';
import { setupSyntheticSession } from '../../lib/pipeline-runner';
import { withEnvironment, withAnyEnvironment } from '../../lib/prisma-rls';
import { shouldUseCanned, withCannedMode } from '../../lib/canned-mode';
import { PERSONA_SCRIPTS, type PersonaId } from '../../lib/persona-scripts';
import { exportTraceToClinicianFormat, type PerTurnTrace } from '../../lib/trace-export';
import { invokeAgent } from '../../lib/agent-adapter';

// ─── Direct import of apps/api's real orchestrator ──────────────────────────
// Same relative-import pattern as pipeline-runner.ts / agent-adapter.ts.
import { processTurn } from '@evia/api/src/pipeline/orchestrator';
import type { TestModeOptions } from '@evia/api/src/pipeline/types';

// ─── TH-S22: direct import of apps/api's real session-close flow ───────────
// Same relative-import pattern/depth as the orchestrator import above
// (server/routers/conversation.ts -> ../../../../api/src/...).
import { closeSession } from '@evia/api/src/lib/session-close';

const environmentSchema = z.enum(['sandbox', 'staging', 'beta']);
const personaIdSchema = z.enum(['anxious', 'crisis-escalating', 'fidelity', 'adversarial']);

function requirePrisma<T>(prisma: T | null): T {
  if (!prisma) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Database not configured',
    });
  }
  return prisma;
}

/**
 * TH-S21 — TH-08 Conversation Driver, `conversation` router.
 *
 * A persona script is N sequential turns against ONE persistent synthetic
 * session — the key difference from `pipeline.ts`'s `runFullPipeline` (which
 * spins up a fresh session per single message). Turns are awaited strictly
 * in order since it is one ongoing conversation.
 */
export const conversationRouter = router({
  /**
   * Plays a built-in persona script turn-by-turn against one fresh synthetic
   * session, stopping early if the pipeline routes to the crisis silence
   * path mid-script (matching real pipeline behavior — no further turns are
   * sent to a session that has already been crisis-routed this turn).
   * Persists a `TestRun` row with the assembled `PerTurnTrace[]` under
   * `results.turns`, mirroring the `results` Json convention `pipeline.ts`
   * established (`{ result, trace, signals }` there; `{ turns }` here since
   * a conversation's natural unit is "one row per turn", not one pipeline
   * run).
   */
  runPersonaScript: protectedProcedure
    .input(
      z.object({
        personaId: personaIdSchema,
        environment: environmentSchema,
      }),
    )
    .mutation(async ({ input }) => {
      const personaId = input.personaId as PersonaId;
      const script = PERSONA_SCRIPTS[personaId];
      const useCanned = shouldUseCanned(input.environment);

      const { uid, sessionId } = await setupSyntheticSession();

      const turns: PerTurnTrace[] = [];
      let endedInCrisis = false;
      let overallStatus: 'pass' | 'error' = 'pass';

      for (let i = 0; i < script.length; i++) {
        const message = script[i];
        const turnNumber = i + 1;

        const testMode: TestModeOptions = { captureSignalBus: true };

        const start = performance.now();
        const result = await withCannedMode(useCanned, () =>
          processTurn(uid, sessionId, message, null, { testMode }),
        );
        const latencyMs = performance.now() - start;

        const signals = result.signals ?? [];
        const safetySignal = signals.find((s) => s.boundary === 'A1_result');
        const safetyState =
          typeof safetySignal?.payload === 'string' ? safetySignal.payload : null;

        const response = result.type === 'agent_turn' ? result.message : null;

        turns.push({
          turnNumber,
          message,
          response,
          latencyMs,
          resultType: result.type,
          safetyState,
          signals,
        });

        if (result.type === 'error') {
          overallStatus = 'error';
        }

        if (result.type === 'crisis') {
          endedInCrisis = true;
          break; // crisis silence path: no further turns follow, mirroring real pipeline behavior
        }
      }

      const run = await withEnvironment(input.environment, (tx) =>
        tx.testRun.create({
          data: {
            environment: input.environment,
            altitude: 1,
            status: overallStatus,
            frozen_triple: {},
            results: JSON.parse(JSON.stringify({ turns, personaId, endedInCrisis, uid, sessionId })),
            activated_agents: [],
            manually_selected_agents: [],
            dependency_graph: {},
            completed_at: new Date(),
          },
        }),
      );

      // uid/sessionId are surfaced here (and in `results` above) so the
      // conversation driver UI can drive TH-S22's "Simulate session close"
      // action against this exact synthetic session without a second
      // round trip to look them up.
      return { runId: run.id, personaId, turns, endedInCrisis, uid, sessionId };
    }),

  /**
   * Reads back the per-turn trace stored by `runPersonaScript` under
   * `TestRun.results.turns`.
   */
  getPerTurnTrace: protectedProcedure
    .input(z.object({ runId: z.string().min(1) }))
    .query(async ({ input }) => {
      const found = await withAnyEnvironment((tx) => tx.testRun.findUnique({ where: { id: input.runId } }));
      if (!found) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `No TestRun with id '${input.runId}'` });
      }
      const run = found.result;

      const results = run.results as { turns?: PerTurnTrace[]; endedInCrisis?: boolean } | null;

      return {
        runId: run.id,
        turns: results?.turns ?? [],
        endedInCrisis: results?.endedInCrisis ?? false,
      };
    }),

  /**
   * Loads the stored trace for a run and formats it via `trace-export.ts`
   * into the requested clinician-review format.
   */
  exportTrace: protectedProcedure
    .input(z.object({ runId: z.string().min(1), format: z.enum(['json', 'csv']) }))
    .query(async ({ input }) => {
      const found = await withAnyEnvironment((tx) => tx.testRun.findUnique({ where: { id: input.runId } }));
      if (!found) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `No TestRun with id '${input.runId}'` });
      }
      const run = found.result;

      const results = run.results as { turns?: PerTurnTrace[] } | null;
      const turns = results?.turns ?? [];

      const { json, csv } = exportTraceToClinicianFormat(turns);

      return { runId: run.id, format: input.format, content: input.format === 'json' ? json : csv };
    }),

  /**
   * TH-S22 — "Simulate session close" action for the conversation driver.
   *
   * Design rationale (see also the SRS modal at
   * apps/test-harness/src/app/components/SrsSessionCloseModal.tsx, which
   * calls this procedure on rating selection):
   *
   * `closeSession` (direct-imported from apps/api/src/lib/session-close.js,
   * the same relative-import convention pipeline-runner.ts/agent-adapter.ts
   * already established) does the *real* work of marking
   * `SessionLog.session_ended_at` — a genuine DB write, not a simulation.
   * It then internally calls `enqueueSummaryJob`
   * (apps/api/src/lib/summary-enqueue.js), but that function only actually
   * runs a summary in two cases: a real deployment with Cloud Tasks fully
   * configured (CLOUD_TASKS_PROJECT_ID/QUEUE/LOCATION/WORKER_URL/
   * WORKER_SERVICE_ACCOUNT_EMAIL), or NODE_ENV=development with
   * CLOUD_TASKS_WORKER_URL set (a local-dev HTTP bypass). Neither is
   * configured in this harness environment, so left alone,
   * `enqueueSummaryJob` just warns and no-ops — `closeSession` would report
   * `summaryEnqueued: true` (it doesn't throw) while nothing downstream
   * actually ran.
   *
   * So this procedure explicitly triggers the real summary/memory pass
   * itself, synchronously, right after `closeSession` returns — by reusing
   * TH-S09's `invokeAgent('A13', ...)` adapter (agent-adapter.ts), the same
   * adapter `runFullPipeline` (TH-S18, pipeline-runner.ts) already reuses
   * for this exact purpose after a normal turn. `invokeAgent('A13'/'A15', ...)`
   * both resolve to one combined `POST /tasks/summary` call against
   * apps/worker (memory extraction runs *inside* `generateSessionSummary`
   * there — see agent-adapter.ts's own comment for why A13 and A15 collapse
   * into a single call). This makes the harness's simulated session close a
   * harness-controlled, synchronous two-step: (1) real `closeSession` DB
   * write, (2) explicit worker-triggered summary/memory generation — rather
   * than depending on `enqueueSummaryJob`'s production-only Cloud Tasks path,
   * which this local/test environment cannot exercise.
   */
  simulateSessionClose: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().min(1),
        userId: z.string().min(1),
        srsScore: z.number().int().min(1).max(4).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const prisma = requirePrisma(ctx.prisma);

      const closeResult = await closeSession(
        input.sessionId,
        input.userId,
        'USER_REQUESTED' as CloseReason,
      );

      const summaryResult = await invokeAgent('A13', {
        sessionId: input.sessionId,
        userId: input.userId,
      });
      const summaryOutput = summaryResult.output as { error?: string; processed?: boolean } | null;
      const summaryTriggered = Boolean(summaryOutput) && !summaryOutput?.error;

      const summaryRow = await prisma.sessionSummary.findFirst({
        where: { session_id: input.sessionId },
      });

      return {
        closeResult,
        summaryTriggered,
        summaryRow,
        srsScore: input.srsScore ?? null,
      };
    }),
});
