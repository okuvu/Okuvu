import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import type { TestRunStatus } from '@okuvu/shared-types';
import { protectedProcedure, router } from '../trpc';
import {
  runFullPipeline as runFullPipelineImpl,
  setupSyntheticSession,
} from '../../lib/pipeline-runner';
import { withEnvironment, withAnyEnvironment } from '../../lib/prisma-rls';
import { isCannedRunActive } from '../../lib/canned-mode';
import { resolveFrozenTriple } from '../../lib/frozen-triple';
import { checkPipelineInvariants } from '../../lib/pipeline-invariants';
import { checkCrisisRecordCompleteness } from '../../lib/crisis-record';
import { buildRunHeader } from '../../lib/run-identity';
import { prisma } from '../../lib/prisma';

// ─── Direct import of apps/api's real orchestrator + its test-hook types ───
// Same relative-import pattern as pipeline-runner.ts / agent-adapter.ts.
import { processTurn } from '@okuvu/api/src/pipeline/orchestrator';
import type { TestModeOptions } from '@okuvu/api/src/pipeline/types';

const environmentSchema = z.enum(['sandbox', 'staging', 'beta']);

const safetyStateSchema = z.enum(['S0', 'S1', 'S2', 'S3', 'S4']);
const governanceStateSchema = z.enum(['Active', 'Restricted', 'Blocked']);
const routerDecisionSchema = z.object({
  agent: z.enum(['crisis', 'medical-emergency', 'deterministic-grounding', 'A2']),
  mode: z.enum(['normal', 'blocked']).optional(),
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

      const { result, trace, activatedAgents, workerStage } = await runFullPipelineImpl({
        uid,
        sessionId,
        message: input.message,
        testMode: input.testMode as TestModeOptions | undefined,
      });

      // B1 (OKUVU — Plumbing Fixes & Rationale v1.0): a run where any pipeline
      // stage failed or no-oped is marked 'incomplete' — excluded from
      // scorecard aggregation, never scored clean. Previously the harness
      // scored a run whose A13/A15 worker stage silently no-oped ('WORKER_URL
      // is not configured', processed:false) as a clean PASS — the exact
      // H-1-class false pass this prevents. Only real-turn results have a
      // worker stage (crisis turns are persisted before any summary could
      // run); 'error' takes priority over 'incomplete'.
      const workerStageIncomplete =
        result.type !== 'crisis' && (workerStage.attempted ? !workerStage.ok : true);

      // Hard-fail gating (mvp-v2-engineering-spec.md §5.1/§5.2): a canned-mode
      // hygiene violation (this run wasn't in sandbox, yet went canned), a
      // silent fallback, or a broken pipeline invariant (signal ordering,
      // suppression) all demote status to 'halt' — previously this only
      // checked result.type === 'error', so a turn that quietly degraded to
      // a hardcoded fallback recorded identically to a genuine pass.
      // (A4 note: fallbackUsed is now set on EVERY substitute path — block
      // turns included — so the fallback gate sees the whole truth.)
      const canned = isCannedRunActive();
      const cannedHygieneViolation = input.environment !== 'sandbox' && canned;
      const invariantViolations = checkPipelineInvariants(result.signals ?? [], result.type);

      const status: TestRunStatus =
        result.type === 'error'
          ? 'error'
          : workerStageIncomplete
            ? 'incomplete'
            : cannedHygieneViolation ||
                (result.type === 'agent_turn' && result.fallbackUsed) ||
                invariantViolations.length > 0
              ? 'halt'
              : 'pass';

      const run = await withEnvironment(input.environment, async (tx) => {
        const frozenTriple = await resolveFrozenTriple({
          tx,
          environment: input.environment,
          inputId: input.message,
          rawOutput: result.type === 'agent_turn' ? result.message : result.type,
        });

        return tx.testRun.create({
          data: {
            environment: input.environment,
            altitude: 1,
            status,
            canned,
            // B2: run identity header (see run-identity.ts) — build_sha /
            // corpus_version (null for non-corpus runs) / run_mode.
            ...buildRunHeader('full_pipeline'),
            frozen_triple: JSON.parse(JSON.stringify(frozenTriple)),
            // Prisma's Json input type wants InputJsonValue, not our typed
            // domain objects — a JSON round-trip is the simplest way to erase
            // the (structurally-JSON-safe) TS types without hand-writing casts
            // field by field.
            results: JSON.parse(
              JSON.stringify({
                result,
                trace,
                signals: result.signals ?? [],
                invariantViolations,
                // B1: why the run was (or wasn't) marked incomplete.
                workerStage,
              }),
            ),
            activated_agents: activatedAgents,
            manually_selected_agents: activatedAgents,
            dependency_graph: {},
            completed_at: new Date(),
          },
        });
      });

      return { runId: run.id, result, trace, invariantViolations };
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
      const { uid, userId, sessionId } = await setupSyntheticSession();

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

      // Crisis-record completeness (§5.2, "audit fix 1.3" — see
      // crisis-record.ts's module doc comment). Deliberately additive, not
      // folded into `verdict`: `verdict` above is the routing-decision check
      // this procedure has always made; `recordCompleteness` is new
      // visibility into whether that crisis turn was actually persisted.
      // Expect `complete: false` against current apps/api code — that's the
      // real, already-flagged gap this check exists to surface, not a bug
      // in the check.
      const recordCompleteness = prisma
        ? await checkCrisisRecordCompleteness({ prisma, sessionId, userId })
        : null;

      return {
        verdict,
        recordCompleteness,
        details:
          verdict === 'PASS'
            ? 'processTurn returned { type: "crisis" } — no agent_turn message, no A2 output.'
            : `Expected the crisis silence path but processTurn returned type '${result.type}' (A2 output may exist).`,
        result,
      };
    }),
});
