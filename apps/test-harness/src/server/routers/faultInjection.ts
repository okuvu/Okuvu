import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../trpc';
import { TEST_USER_PREFIX } from '../../lib/mock-context';
import { withEnvironment } from '../../lib/prisma-rls';

// ─── Direct import of apps/api's orchestrator, following the same
// relative-import pattern agent-adapter.ts uses (TH-S09/TH-S10 precedent).
import { processTurn } from '@okuvu/api/src/pipeline/orchestrator';
import { A2_DEGRADED_RESPONSE } from '@okuvu/api/src/pipeline/fallbacks';
import type { TestModeOptions } from '@okuvu/api/src/pipeline/types';

// ─── Shared zod pieces ──────────────────────────────────────────────────

const boundarySchema = z.enum(['A1', 'A2', 'A9_pre', 'A9_post']);
const faultTypeSchema = z.enum(['timeout', 'api_error']);
const environmentSchema = z.enum(['sandbox', 'staging', 'beta']);

type PrismaLike = {
  user: { upsert: (args: unknown) => Promise<{ id: string; firebase_uid: string }> };
  sessionLog: {
    create: (args: unknown) => Promise<{ id: string }>;
  };
  testRun: { create: (args: unknown) => Promise<{ id: string }> };
  governanceLog: {
    findFirst: (args: unknown) => Promise<{
      id: string;
      violation_type: string | null;
      decision: string;
    } | null>;
  };
};

/**
 * Create a fresh synthetic `test-user-*` User row plus a brand-new
 * SessionLog row so `processTurn` has both rows it requires
 * (`prisma.user.findUnique({ where: { firebase_uid } })` and
 * `prisma.sessionLog.findUnique({ where: { id: sessionId } })`).
 *
 * A new SessionLog is created per call (not reused) so fault-injection runs
 * never collide with each other's turn_count / GovernanceLog rows.
 */
async function setupSyntheticSession(
  prisma: PrismaLike,
  label: string,
): Promise<{ uid: string; sessionId: string; userId: string }> {
  const firebaseUid = `${TEST_USER_PREFIX}fault-${label}-${randomUUID()}`;

  const user = await prisma.user.upsert({
    where: { firebase_uid: firebaseUid },
    update: {},
    create: { firebase_uid: firebaseUid, phone_number: '+10000000000' },
  });

  const sessionLog = await prisma.sessionLog.create({
    data: { user_id: user.id, turn_count: 0 },
  });

  return { uid: firebaseUid, sessionId: sessionLog.id, userId: user.id };
}

function statusForResult(result: { type: string; fallbackUsed?: boolean }): 'pass' | 'warning' | 'error' {
  if (result.type === 'error') return 'error';
  if (result.type === 'agent_turn' && result.fallbackUsed) return 'warning';
  if (result.type === 'crisis') return 'warning';
  return 'pass';
}

/**
 * Persist a TestRun row for a fault-injection run.
 *
 * `TestRun` has no dedicated fault-config field, so per the story's guidance
 * the fault config (boundary/type + which kind of injection was used) is
 * recorded inside `dependency_graph` (an arbitrary Json column, and
 * semantically closest to "what shaped this run's execution path"), while
 * the full pipeline result is recorded in `results`.
 */
async function persistTestRun(params: {
  environment: 'sandbox' | 'staging' | 'beta';
  agent: string;
  faultConfig: Record<string, unknown>;
  result: unknown;
  status: 'pass' | 'warning' | 'error';
}): Promise<string> {
  const run = await withEnvironment(params.environment, (tx) =>
    tx.testRun.create({
      data: {
        environment: params.environment,
        altitude: 0,
        agent: params.agent,
        status: params.status,
        frozen_triple: {},
        results: JSON.parse(JSON.stringify(params.result)),
        activated_agents: [params.agent],
        manually_selected_agents: [params.agent],
        dependency_graph: JSON.parse(JSON.stringify({ fault: params.faultConfig })),
      },
    }),
  );
  return run.id;
}

export const faultInjectionRouter = router({
  /**
   * Force a fault at a chosen pipeline boundary (A1 / A2 / A9_pre / A9_post)
   * via `processTurn`'s existing `opts.testMode.faults` hook (TH-S10) — the
   * injected error routes through the orchestrator's real fallback/catch
   * logic, nothing new is added here.
   */
  injectModelFailure: protectedProcedure
    .input(
      z.object({
        boundary: boundarySchema,
        type: faultTypeSchema,
        message: z.string(),
        environment: environmentSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.prisma) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured' });
      }
      const prisma = ctx.prisma as unknown as PrismaLike;

      const { uid, sessionId } = await setupSyntheticSession(prisma, `model-${input.boundary}`);

      const testMode: TestModeOptions = {
        faults: { boundary: input.boundary, type: input.type },
        captureSignalBus: true,
      };

      const result = await processTurn(uid, sessionId, input.message, null, { testMode });

      const status = statusForResult(result);
      const runId = await persistTestRun({
        environment: input.environment,
        agent: input.boundary,
        faultConfig: { kind: 'model_failure', boundary: input.boundary, type: input.type },
        result,
        status,
      });

      return { result, runId };
    }),

  /**
   * Simulate a signal-drop fault. TH-S10's `testMode.signalOverride` only
   * supports `boundary: 'a2_result'` (a shallow merge onto the object
   * `handleTurn` returns), so this endpoint demonstrates one working
   * example: it nulls out A2's `signal` field before it's read, which is
   * exactly what a dropped/missing signal from A2 would look like to the
   * rest of the pipeline (no intensity estimate, no tool card derivation).
   * Extending this to other boundaries would require
   * TH-S10 to add more `signalOverride` boundary support — out of scope
   * here.
   */
  injectSignalFailure: protectedProcedure
    .input(
      z.object({
        message: z.string(),
        environment: environmentSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.prisma) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured' });
      }
      const prisma = ctx.prisma as unknown as PrismaLike;

      const { uid, sessionId } = await setupSyntheticSession(prisma, 'signal-a2');

      const testMode: TestModeOptions = {
        signalOverride: { boundary: 'a2_result', payload: { signal: null } },
        captureSignalBus: true,
      };

      const result = await processTurn(uid, sessionId, input.message, null, { testMode });

      const status = statusForResult(result);
      const runId = await persistTestRun({
        environment: input.environment,
        agent: 'A2',
        faultConfig: { kind: 'signal_drop', boundary: 'A2', field: 'signal' },
        result,
        status,
      });

      return { result, runId };
    }),

  /**
   * Verify the 3 documented fail-safe assertions.
   *
   * Implemented as a **live re-run** (fresh synthetic sessions per
   * assertion) rather than a stored-result lookup keyed by `runId`: the
   * assertions need specific `testMode` combinations (e.g. assertion 3
   * needs both `injectA1: 'S2'` AND `faults.boundary: 'A9_post'` in the
   * *same* call, which `injectModelFailure` above doesn't produce), and a
   * fresh run avoids having to design/store enough state on `TestRun` to
   * reconstruct these later. This keeps the verifier self-contained and
   * always exercising the current orchestrator code, at the cost of doing
   * 3 extra `processTurn` calls each time it's invoked.
   */
  verifyFailSafe: protectedProcedure
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      if (!ctx.prisma) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured' });
      }
      const prisma = ctx.prisma as unknown as PrismaLike;

      // ── Assertion 1: A1 failure → S2 fallback used ──
      const session1 = await setupSyntheticSession(prisma, 'verify-a1');
      const result1 = await processTurn(session1.uid, session1.sessionId, 'I feel overwhelmed today.', null, {
        testMode: { faults: { boundary: 'A1', type: 'timeout' }, captureSignalBus: true },
      });
      const a1Signal =
        result1.type !== 'error'
          ? result1.signals?.find((s) => s.boundary === 'A1_result')
          : undefined;
      const assertion1: 'PASS' | 'FAIL' = a1Signal?.payload === 'S2' ? 'PASS' : 'FAIL';

      // ── Assertion 2: A2 failure → A2_DEGRADED_RESPONSE returned ──
      const session2 = await setupSyntheticSession(prisma, 'verify-a2');
      const result2 = await processTurn(session2.uid, session2.sessionId, 'Can we talk through something?', null, {
        testMode: { faults: { boundary: 'A2', type: 'api_error' } },
      });
      const assertion2: 'PASS' | 'FAIL' =
        result2.type === 'agent_turn' &&
        result2.message === A2_DEGRADED_RESPONSE &&
        result2.fallbackUsed === true
          ? 'PASS'
          : 'FAIL';

      // ── Assertion 3: A9-post failure at S2 → safe fallback + GovernanceLog BLOCKED ──
      const session3 = await setupSyntheticSession(prisma, 'verify-a9post');
      const result3 = await processTurn(session3.uid, session3.sessionId, 'Something happened and I need to talk.', null, {
        testMode: { injectA1: 'S2', faults: { boundary: 'A9_post', type: 'api_error' } },
      });
      const govLog = await prisma.governanceLog.findFirst({
        where: { session_id: session3.sessionId, gate: 'A9-POST', decision: 'BLOCKED' },
      });
      const assertion3: 'PASS' | 'FAIL' =
        govLog !== null && govLog.violation_type === 'a9_post_unavailable_s2' ? 'PASS' : 'FAIL';

      return {
        assertion1,
        assertion2,
        assertion3,
        details: {
          assertion1: { result: result1, a1Signal },
          assertion2: { result: result2 },
          assertion3: { result: result3, governanceLog: govLog },
        },
      };
    }),
});
