import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../trpc';
import { diffRuns } from '../../lib/run-diff';
import { withEnvironment, withAnyEnvironment, withAllEnvironments, type TestEnvironment } from '../../lib/prisma-rls';
import type { Prisma } from '@evia/prisma';
import type { FrozenTripleMetadata } from '@evia/shared-types';

/**
 * TH-S25 — TH-10 Trace & Results Viewer, `results` router.
 *
 * `TestRun` rows are append-only/immutable. `archiveRun` is the *only*
 * procedure in this router (or anywhere else in this codebase, per this
 * story's scope) that is allowed to call `prisma.testRun.update`, and it may
 * only ever set `archived_at` — see the comment on that procedure below.
 * Every other procedure here is read-only.
 */

const environmentSchema = z.enum(['sandbox', 'staging', 'beta']);

function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

const FROZEN_TRIPLE_FIELDS: (keyof FrozenTripleMetadata)[] = [
  'modelVersion',
  'promptHash',
  'temperature',
  'safetySettings',
  'suiteVersion',
  'inputId',
  'timestamp',
  'rawOutput',
];

/**
 * Best-effort extraction of a `FrozenTripleMetadata` from a `TestRun`'s
 * `frozen_triple` Json field. Some historical runs (e.g. those created by
 * `stochastic.ts`, which stores `{ targetMetric, threshold, model }`
 * instead) don't populate all 8 fields — this returns whatever is present
 * and `undefined` for the rest, rather than throwing.
 */
function extractFrozenTriple(frozenTriple: unknown): Partial<FrozenTripleMetadata> {
  const stored = asRecord(frozenTriple);
  const out: Partial<FrozenTripleMetadata> = {};
  for (const field of FROZEN_TRIPLE_FIELDS) {
    if (field in stored) {
      (out as Record<string, unknown>)[field] = stored[field];
    }
  }
  return out;
}

export const resultsRouter = router({
  /**
   * Lightweight run list for the results/trace viewer's table. Not part of
   * this story's mandated procedure set, but needed to populate the UI —
   * read-only, no mutation risk.
   */
  listRuns: protectedProcedure
    .input(z.object({ environment: environmentSchema.optional() }).optional())
    .query(async ({ input }) => {
      const findMany = (tx: Prisma.TransactionClient, environment?: TestEnvironment) =>
        tx.testRun.findMany({
          where: environment ? { environment } : undefined,
          orderBy: { created_at: 'desc' },
          take: 100,
        });

      const runs = input?.environment
        ? await withEnvironment(input.environment, (tx) => findMany(tx, input.environment))
        : await withAllEnvironments((tx) => findMany(tx));

      return runs
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .slice(0, 100);
    }),

  /**
   * Archives a run by setting `archived_at`. This is the ONLY field this
   * procedure ever writes — do not add other fields to `data` here. Runs
   * are append-only/immutable; archiving flags a run as no longer active,
   * it never edits its recorded content (frozen_triple, results, etc).
   */
  archiveRun: protectedProcedure
    .input(z.object({ runId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const found = await withAnyEnvironment((tx) => tx.testRun.findUnique({ where: { id: input.runId } }));
      if (!found) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `No TestRun with id '${input.runId}'` });
      }

      return withEnvironment(found.environment, (tx) =>
        tx.testRun.update({
          where: { id: input.runId },
          data: { archived_at: new Date() },
        }),
      );
    }),

  /**
   * Full run detail, including its `TestResultRow`s, plus a best-effort
   * reconstructed trace view. Different sibling routers persist different
   * shapes inside `results` (e.g. `pipeline.ts` stores
   * `{ result, trace, signals }`; `stochastic.ts` stores
   * `{ samples, successCount, n, wilsonCI, ... }`) — this stays defensive
   * and extracts whichever of `trace` / `signals` / `samples` happen to be
   * present, while always returning the raw `results` field too so callers
   * never lose data this procedure doesn't know how to interpret.
   */
  getRun: protectedProcedure
    .input(z.object({ runId: z.string().min(1) }))
    .query(async ({ input }) => {
      const found = await withAnyEnvironment((tx) =>
        tx.testRun.findUnique({
          where: { id: input.runId },
          include: { result_rows: true },
        }),
      );
      if (!found) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `No TestRun with id '${input.runId}'` });
      }
      const run = found.result;

      const results = asRecord(run.results);

      return {
        run,
        resultRows: run.result_rows,
        rawResults: run.results,
        trace: Array.isArray(results.trace) ? results.trace : null,
        signals: Array.isArray(results.signals) ? results.signals : null,
        samples: Array.isArray(results.samples) ? results.samples : null,
      };
    }),

  /**
   * Loads two runs read-only and returns `run-diff.ts`'s itemized diff of
   * their `frozen_triple` (per FrozenTripleMetadata field) and `results`
   * (recursive structural diff).
   */
  compareRuns: protectedProcedure
    .input(z.object({ runIdA: z.string().min(1), runIdB: z.string().min(1) }))
    .query(async ({ input }) => {
      const [foundA, foundB] = await Promise.all([
        withAnyEnvironment((tx) => tx.testRun.findUnique({ where: { id: input.runIdA } })),
        withAnyEnvironment((tx) => tx.testRun.findUnique({ where: { id: input.runIdB } })),
      ]);
      if (!foundA) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `No TestRun with id '${input.runIdA}'` });
      }
      if (!foundB) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `No TestRun with id '${input.runIdB}'` });
      }

      const diff = diffRuns(foundA.result, foundB.result);

      return { runA: foundA.result, runB: foundB.result, diff };
    }),

  /**
   * Returns the immutable audit artifact for a run: the frozen-triple
   * metadata (gracefully degraded — missing fields come back `undefined`
   * rather than throwing, see `extractFrozenTriple`), the captured signals
   * (read from `results.signals` if present), and the dependency graph.
   */
  getAuditArtifact: protectedProcedure
    .input(z.object({ runId: z.string().min(1) }))
    .query(async ({ input }) => {
      const found = await withAnyEnvironment((tx) => tx.testRun.findUnique({ where: { id: input.runId } }));
      if (!found) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `No TestRun with id '${input.runId}'` });
      }
      const run = found.result;

      const results = asRecord(run.results);

      return {
        frozenTriple: extractFrozenTriple(run.frozen_triple),
        signals: results.signals ?? null,
        dependencyGraph: run.dependency_graph ?? null,
      };
    }),
});
