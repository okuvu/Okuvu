import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../trpc';
import { setupSyntheticSession } from '../../lib/pipeline-runner';
import { shouldUseCanned, withCannedMode } from '../../lib/canned-mode';
import { withEnvironment } from '../../lib/prisma-rls';
import type { PerTurnTrace } from '../../lib/trace-export';

// ─── Direct import of apps/api's real orchestrator ──────────────────────────
// Same relative-import pattern as conversation.ts / pipeline.ts.
import { processTurn } from '@evia/api/src/pipeline/orchestrator';
import type { TestModeOptions } from '@evia/api/src/pipeline/types';

const environmentSchema = z.enum(['sandbox', 'staging', 'beta']);
const personaIdSchema = z.enum(['anxious', 'crisis-escalating', 'fidelity', 'adversarial']);
// Same boundary/type vocabulary as faultInjection.ts — reusing it here keeps
// the two routers' fault shapes identical rather than inventing a second one.
const faultSchema = z.object({
  boundary: z.enum(['A1', 'A2', 'A9_pre', 'A9_post']),
  type: z.enum(['timeout', 'api_error']),
});

async function withEnvironmentOrThrow<T>(
  environment: 'sandbox' | 'staging' | 'beta',
  fn: (tx: import('@evia/prisma').Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  try {
    return await withEnvironment(environment, fn);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Database not configured')) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured' });
    }
    throw error;
  }
}

/**
 * Simulator — a plain-language, clinician-facing counterpart to the
 * `conversation` router. `conversation.runPersonaScript` plays a whole
 * built-in script end-to-end in one call; this router splits that same
 * `setupSyntheticSession` + `processTurn` pattern into two procedures so a
 * therapist can hold an open-ended, free-text back-and-forth instead of a
 * fixed script. `plain-language-signals.ts` is what turns each turn's raw
 * signals into non-technical copy for the UI — this router just returns the
 * raw signals/resultType, same as conversation.ts already does.
 */
export const simulatorRouter = router({
  /**
   * Creates ONE persistent synthetic session and a `TestRun` row to append
   * turns to, mirroring `conversation.ts`'s `results: { turns: [...] }`
   * convention so this is inspectable via the existing Results screen too.
   */
  startSession: protectedProcedure
    .input(
      z.object({
        environment: environmentSchema,
        personaId: personaIdSchema.optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { uid, sessionId } = await setupSyntheticSession();

      const run = await withEnvironmentOrThrow(input.environment, (tx) =>
        tx.testRun.create({
          data: {
            environment: input.environment,
            altitude: 1,
            status: 'pass',
            frozen_triple: {},
            results: { turns: [], personaId: input.personaId ?? null, uid, sessionId },
            activated_agents: [],
            manually_selected_agents: [],
            dependency_graph: {},
          },
        }),
      );

      return { runId: run.id, uid, sessionId, personaId: input.personaId ?? null };
    }),

  /**
   * Sends one free-text message to an already-open session. Same
   * `processTurn` call `conversation.ts`'s `runPersonaScript` loop makes
   * per-turn (`conversation.ts:78-101`), just exposed one turn at a time
   * instead of driving a fixed script. Crisis/error turns are returned
   * normally (not thrown) — the UI renders a plain-language card for those
   * rather than treating them as a request failure.
   */
  sendMessage: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1),
        uid: z.string().min(1),
        sessionId: z.string().min(1),
        environment: environmentSchema,
        message: z.string().min(1).max(4000),
        // Optional one-off "what if this step failed?" probe — a single
        // send, not a sticky mode. Reuses processTurn's existing
        // testMode.faults hook (apps/api/src/pipeline/orchestrator.ts),
        // the same one faultInjection.ts already drives.
        fault: faultSchema.optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const useCanned = shouldUseCanned(input.environment);
      const testMode: TestModeOptions = {
        captureSignalBus: true,
        ...(input.fault ? { faults: input.fault } : {}),
      };

      const start = performance.now();
      const result = await withCannedMode(useCanned, () =>
        processTurn(input.uid, input.sessionId, input.message, null, { testMode }),
      );
      const latencyMs = performance.now() - start;

      const signals = result.signals ?? [];
      const safetySignal = signals.find((s) => s.boundary === 'A1_result');
      const safetyState = typeof safetySignal?.payload === 'string' ? safetySignal.payload : null;
      const response = result.type === 'agent_turn' ? result.message : null;

      const turn = await withEnvironmentOrThrow(input.environment, async (tx) => {
        const run = await tx.testRun.findUniqueOrThrow({ where: { id: input.runId } });
        const prevResults = (run.results ?? { turns: [] }) as { turns: PerTurnTrace[] } & Record<string, unknown>;

        const nextTurn: PerTurnTrace = {
          turnNumber: prevResults.turns.length + 1,
          message: input.message,
          response,
          latencyMs,
          resultType: result.type,
          safetyState,
          signals,
        };

        await tx.testRun.update({
          where: { id: input.runId },
          data: {
            results: JSON.parse(JSON.stringify({ ...prevResults, turns: [...prevResults.turns, nextTurn] })),
            status: result.type === 'error' ? 'error' : run.status,
            completed_at: new Date(),
          },
        });

        return nextTurn;
      });

      return { turn, resultType: result.type, signals, latencyMs };
    }),
});
