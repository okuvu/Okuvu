import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../trpc';
import {
  runFullPipeline as runFullPipelineImpl,
  setupSyntheticSession,
} from '../../lib/pipeline-runner';
import { withEnvironment, withAnyEnvironment } from '../../lib/prisma-rls';

// ─── Direct import of apps/api's real orchestrator + its test-hook types ───
// Same relative-import pattern as pipeline-runner.ts / agent-adapter.ts.
import { processTurn } from '@evia/api/src/pipeline/orchestrator';
import type { TestModeOptions } from '@evia/api/src/pipeline/types';

const environmentSchema = z.enum(['sandbox', 'staging', 'beta']);

const safetyStateSchema = z.enum(['S0', 'S1', 'S2', 'S3', 'S4']);
const governanceStateSchema = z.enum(['Active', 'Restricted', 'Blocked']);
const routerDecisionSchema = z.object({
  agent: z.enum(['crisis', 'A2']),
  mode: z.enum(['normal', 'grounding-only', 'alliance-building']).optional(),
});

// Subset of TestModeOptions relevant to a full-pipeline run (TH-S18 spec):
// injectA1 / injectA9 / injectRouter / injectRetrievedContext. `faults` and
// `signalOverride` are intentionally left out of this schema — `faults` is
// exercised by other stories' routers, and `signalOverride` gets its own
// dedicated `overrideSignal` procedure below.
const testModeInputSchema = z
  .object({
    injectA1: safetyStateSchema.optional(),
    injectA9: governanceStateSchema.optional(),
    injectRouter: routerDecisionSchema.optional(),
    injectRetrievedContext: z.string().optional(),
  })
  .partial();

/**
 * Only `'a2_result'` is supported by `processTurn`'s `signalOverride` hook
 * today (TH-S10's implementation shallow-merges the payload onto the A2
 * response object specifically — see apps/api/src/pipeline/orchestrator.ts).
 * We validate against that known-supported list up front and throw a clear
 * BAD_REQUEST for anything else, rather than silently passing through a
 * boundary that would be a no-op inside processTurn.
 */
const SUPPORTED_SIGNAL_OVERRIDE_BOUNDARIES = ['a2_result'] as const;

export const pipelineRouter = router({
  /**
   * Run the real end-to-end pipeline (A1 -> A9-pre -> A8 -> A2 -> A9-post,
   * plus the A13/A15 combined worker call) against a fresh synthetic
   * session, then persist a `TestRun` row.
   *
   * v1 simplification: there is no partial-agent-toggle UI yet (that's
   * TH-S19/TH-S20's scope), so every agent that actually activates this run
   * is both "activated" and "manually selected" — `manually_selected_agents`
   * is set equal to `activated_agents`.
   *
   * `TestRun` has no dedicated column for the signal-bus array, so it is
   * stored inside the `results` Json field alongside the trace, as
   * `results.signals` (see `captureSignalBus` below, which reads it back
   * out from there).
   */
  runFullPipeline: protectedProcedure
    .input(
      z.object({
        message: z.string().min(1),
        environment: environmentSchema,
        testMode: testModeInputSchema.optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { uid, sessionId } = await setupSyntheticSession();

      const { result, trace, activatedAgents } = await runFullPipelineImpl({
        uid,
        sessionId,
        message: input.message,
        testMode: input.testMode as TestModeOptions | undefined,
      });

      const status = result.type === 'error' ? 'error' : 'pass';

      const run = await withEnvironment(input.environment, (tx) =>
        tx.testRun.create({
          data: {
            environment: input.environment,
            altitude: 1,
            status,
            frozen_triple: {},
            // Prisma's Json input type wants InputJsonValue, not our typed
            // domain objects — a JSON round-trip is the simplest way to erase
            // the (structurally-JSON-safe) TS types without hand-writing casts
            // field by field.
            results: JSON.parse(
              JSON.stringify({
                result,
                trace,
                signals: result.signals ?? [],
              }),
            ),
            activated_agents: activatedAgents,
            manually_selected_agents: activatedAgents,
            dependency_graph: {},
            completed_at: new Date(),
          },
        }),
      );

      return { runId: run.id, result, trace };
    }),

  /**
   * Calls `processTurn` with `testMode.signalOverride` set on a fresh
   * synthetic session. Only `boundary: 'a2_result'` is currently supported
   * by the orchestrator's TH-S10 implementation — any other boundary is
   * rejected here with a clear BAD_REQUEST rather than silently passed
   * through as a no-op.
   */
  overrideSignal: protectedProcedure
    .input(
      z.object({
        message: z.string().min(1),
        environment: environmentSchema,
        boundary: z.string(),
        payload: z.unknown(),
      }),
    )
    .mutation(async ({ input }) => {
      if (!SUPPORTED_SIGNAL_OVERRIDE_BOUNDARIES.includes(input.boundary as 'a2_result')) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Unsupported signalOverride boundary '${input.boundary}'. processTurn (TH-S10) only supports: ${SUPPORTED_SIGNAL_OVERRIDE_BOUNDARIES.join(', ')}.`,
        });
      }

      const { uid, sessionId } = await setupSyntheticSession();

      const testMode: TestModeOptions = {
        captureSignalBus: true,
        signalOverride: { boundary: input.boundary, payload: input.payload },
      };

      const result = await processTurn(uid, sessionId, input.message, null, { testMode });

      return { result };
    }),

  /**
   * Read back the signal-bus array stashed inside `TestRun.results.signals`
   * by `runFullPipeline` (see that procedure's doc comment — `TestRun` has
   * no dedicated signals column).
   */
  captureSignalBus: protectedProcedure
    .input(z.object({ runId: z.string().min(1) }))
    .query(async ({ input }) => {
      const found = await withAnyEnvironment((tx) => tx.testRun.findUnique({ where: { id: input.runId } }));
      if (!found) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `No TestRun with id '${input.runId}'` });
      }

      const results = found.result.results as { signals?: unknown[] } | null;
      return { runId: found.result.id, signals: results?.signals ?? [] };
    }),

  /**
   * Validates the silence path: force the crisis route deterministically
   * via `injectA1: 'S4'` (rather than relying on a real crisis-triggering
   * message), then assert `processTurn` returned `{ type: 'crisis' }` — i.e.
   * no A2 output / no agent_turn message exists for this turn.
   */
  validateSilencePath: protectedProcedure
    .input(
      z.object({
        environment: environmentSchema,
        message: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { uid, sessionId } = await setupSyntheticSession();

      const testMode: TestModeOptions = {
        injectA1: 'S4',
        captureSignalBus: true,
      };

      const result = await processTurn(
        uid,
        sessionId,
        input.message ?? 'test-harness silence-path probe',
        null,
        { testMode },
      );

      const verdict = result.type === 'crisis' ? 'PASS' : 'FAIL';

      return {
        verdict,
        details:
          verdict === 'PASS'
            ? 'processTurn returned { type: "crisis" } — no agent_turn message, no A2 output.'
            : `Expected the crisis silence path but processTurn returned type '${result.type}' (A2 output may exist).`,
        result,
      };
    }),
});
