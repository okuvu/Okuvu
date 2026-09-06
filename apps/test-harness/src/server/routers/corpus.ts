import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import type { CorpusCase as PrismaCorpusCase } from '@evia/prisma';
import type { CorpusCase, TestRunStatus } from '@evia/shared-types';
import { protectedProcedure, router } from '../trpc';
import { createNewVersion } from '@/lib/corpus-versioning';
import { exportPairedComparisonRows } from '@/lib/paired-export';
import { setupSyntheticSession, runFullPipeline } from '@/lib/pipeline-runner';
import { judgeReply, type JudgeResult } from '@/lib/judge';
import { withEnvironment } from '@/lib/prisma-rls';

const environmentSchema = z.enum(['sandbox', 'staging', 'beta']);
export const corpusCaseTypeSchema = z.enum(['safety', 'fidelity', 'adversarial', 'persona']);
export const dataOriginSchema = z.enum(['synthetic', 'paraphrased', 'real']);

/**
 * Router responses include `supersedesId` alongside the shared-types
 * CorpusCase fields, so callers (the corpus UI) can reconstruct
 * version-lineage/history and paired-comparison pairs without a second
 * round trip. `supersedesId` isn't part of the shared-types interface, but
 * this is a strict superset of it — every field the interface promises is
 * still present.
 */
export type CorpusCaseWithLineage = CorpusCase & { supersedesId: string | null };

/** Map a Prisma CorpusCase row (snake_case) to the shared-types CorpusCase shape. */
function toCorpusCase(row: PrismaCorpusCase): CorpusCaseWithLineage {
  return {
    id: row.id,
    type: row.type,
    version: row.version,
    input: row.input,
    expectedOutput: row.expected_output ?? undefined,
    tags: row.tags,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    dataOrigin: row.data_origin,
    supersedesId: row.supersedes_id,
  };
}

/** The "sandbox/staging = synthetic only" rule, as a plain boolean check reusable by both the single-case and bulk-import paths. */
function isDataOriginAllowed(dataOrigin: string, environment: string): boolean {
  return dataOrigin !== 'real' || environment === 'beta';
}

/**
 * Server-side enforcement of the "sandbox/staging = synthetic only" rule.
 * `real` data may only ever be created/versioned against the `beta`
 * environment. This reads `environment` from the (validated) tRPC input,
 * never from anything client-trusted beyond that, so it cannot be bypassed
 * by a client claiming a different environment for display purposes.
 */
function assertDataOriginAllowed(dataOrigin: string, environment: string) {
  if (!isDataOriginAllowed(dataOrigin, environment)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'data_origin "real" is only permitted in the beta environment',
    });
  }
}

export const corpusRouter = router({
  listCases: protectedProcedure
    .input(
      z.object({
        type: corpusCaseTypeSchema.optional(),
        tags: z.array(z.string()).optional(),
        environment: environmentSchema,
        includeHistory: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.prisma) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured' });
      }
      const { prisma } = ctx;

      const where: Record<string, unknown> = {};
      if (input.type) where.type = input.type;
      if (input.tags && input.tags.length > 0) where.tags = { hasSome: input.tags };

      if (input.includeHistory) {
        const rows = await prisma.corpusCase.findMany({
          where,
          orderBy: [{ type: 'asc' }, { created_at: 'desc' }],
        });
        return rows.map(toCorpusCase);
      }

      // "Latest version per lineage" == cases that nothing else supersedes,
      // equivalent to:
      //   WHERE NOT EXISTS (SELECT 1 FROM CorpusCase c2 WHERE c2.supersedes_id = c.id)
      // Computed here as a set-difference rather than a raw SQL subquery so
      // it stays portable through the Prisma query builder.
      const [candidates, supersededRows] = await Promise.all([
        prisma.corpusCase.findMany({
          where,
          orderBy: [{ type: 'asc' }, { created_at: 'desc' }],
        }),
        prisma.corpusCase.findMany({
          where: { supersedes_id: { not: null } },
          select: { supersedes_id: true },
        }),
      ]);

      const supersededIds = new Set(
        supersededRows.map((r) => r.supersedes_id).filter((id): id is string => !!id),
      );

      return candidates.filter((c) => !supersededIds.has(c.id)).map(toCorpusCase);
    }),

  createCase: protectedProcedure
    .input(
      z.object({
        type: corpusCaseTypeSchema,
        input: z.string().min(1),
        expected_output: z.string().optional(),
        tags: z.array(z.string()).default([]),
        data_origin: dataOriginSchema,
        environment: environmentSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.prisma) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured' });
      }

      // Core security acceptance criterion: sandbox/staging may only ever
      // contain synthetic (or paraphrased) data. `real` data is beta-only.
      assertDataOriginAllowed(input.data_origin, input.environment);

      const created = await ctx.prisma.corpusCase.create({
        data: {
          type: input.type,
          input: input.input,
          expected_output: input.expected_output,
          tags: input.tags,
          data_origin: input.data_origin,
        },
      });

      return toCorpusCase(created);
    }),

  versionCase: protectedProcedure
    .input(
      z.object({
        caseId: z.string(),
        updates: z.object({
          input: z.string().optional(),
          expectedOutput: z.string().optional(),
          tags: z.array(z.string()).optional(),
          dataOrigin: dataOriginSchema.optional(),
        }),
        environment: environmentSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.prisma) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured' });
      }
      const { prisma } = ctx;

      const existing = await prisma.corpusCase.findUnique({ where: { id: input.caseId } });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Corpus case not found' });
      }

      const previous = toCorpusCase(existing);
      const newVersion = createNewVersion(previous, {
        input: input.updates.input,
        expectedOutput: input.updates.expectedOutput,
        tags: input.updates.tags,
      });

      // A version may change data_origin, so re-validate the rule against
      // the *new* row's data_origin, not just the previous one's.
      const nextDataOrigin = input.updates.dataOrigin ?? newVersion.dataOrigin ?? 'synthetic';
      assertDataOriginAllowed(nextDataOrigin, input.environment);

      const created = await prisma.corpusCase.create({
        data: {
          type: newVersion.type,
          version: newVersion.version,
          input: newVersion.input,
          expected_output: newVersion.expectedOutput,
          tags: newVersion.tags,
          data_origin: nextDataOrigin,
          supersedes_id: newVersion.supersedesId,
        },
      });

      return toCorpusCase(created);
    }),

  exportPairedComparison: protectedProcedure
    .input(z.object({ caseIds: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.prisma) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured' });
      }
      const { prisma } = ctx;

      const rows = await prisma.corpusCase.findMany({
        where: { id: { in: input.caseIds } },
      });
      const rowsById = new Map(rows.map((r) => [r.id, r]));

      // Pairs are (old, new) found via supersedes_id chains: for each
      // requested case that supersedes another requested case, that's a
      // pair. If a requested case's predecessor wasn't included in
      // caseIds, fall back to loading it directly.
      const pairs: { oldCase: CorpusCase; newCase: CorpusCase }[] = [];
      for (const row of rows) {
        if (!row.supersedes_id) continue;
        let oldRow = rowsById.get(row.supersedes_id);
        if (!oldRow) {
          oldRow =
            (await prisma.corpusCase.findUnique({ where: { id: row.supersedes_id } })) ??
            undefined;
        }
        if (!oldRow) continue;
        pairs.push({ oldCase: toCorpusCase(oldRow), newCase: toCorpusCase(row) });
      }

      const csv = exportPairedComparisonRows(pairs);
      return { csv, pairCount: pairs.length };
    }),

  /**
   * Bulk-import CorpusCase rows (e.g. parsed client-side from an Excel/CSV
   * file). Each row is validated and rejected independently — one bad row
   * (invalid type/data_origin, empty input, or a `real` origin outside beta)
   * does not block the rest of a batch from being created.
   */
  bulkImportCases: protectedProcedure
    .input(
      z.object({
        environment: environmentSchema,
        rows: z
          .array(
            z.object({
              type: z.string(),
              input: z.string(),
              expected_output: z.string().optional(),
              tags: z.array(z.string()).default([]),
              data_origin: z.string().optional(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.prisma) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured' });
      }

      const created: CorpusCaseWithLineage[] = [];
      const rejected: { row: number; reason: string }[] = [];

      for (let i = 0; i < input.rows.length; i++) {
        const row = input.rows[i];

        if (row.input.trim().length === 0) {
          rejected.push({ row: i, reason: 'input is empty' });
          continue;
        }

        const typeResult = corpusCaseTypeSchema.safeParse(row.type);
        if (!typeResult.success) {
          rejected.push({
            row: i,
            reason: `invalid type "${row.type}" (must be one of: ${corpusCaseTypeSchema.options.join(', ')})`,
          });
          continue;
        }

        const dataOriginResult = dataOriginSchema.safeParse(row.data_origin || 'synthetic');
        if (!dataOriginResult.success) {
          rejected.push({
            row: i,
            reason: `invalid data_origin "${row.data_origin}" (must be one of: ${dataOriginSchema.options.join(', ')})`,
          });
          continue;
        }

        if (!isDataOriginAllowed(dataOriginResult.data, input.environment)) {
          rejected.push({
            row: i,
            reason: 'data_origin "real" is only permitted in the beta environment',
          });
          continue;
        }

        const createdRow = await ctx.prisma.corpusCase.create({
          data: {
            type: typeResult.data,
            input: row.input,
            expected_output: row.expected_output || undefined,
            tags: row.tags,
            data_origin: dataOriginResult.data,
          },
        });

        created.push(toCorpusCase(createdRow));
      }

      return { created, rejected };
    }),

  /**
   * Run a single CorpusCase through the real end-to-end pipeline (mirrors
   * pipelineRouter.runFullPipeline exactly) and, when the case has an
   * expected_output and produced a real reply, grade that reply against it
   * via an LLM judge. Persists a TestRun the same way runFullPipeline does,
   * so it appears in the existing Results page automatically.
   *
   * Judging is skipped in sandbox: sandbox replies are template-based
   * (canned mode), not meaningfully comparable to a real expected-behavior
   * description.
   */
  runCase: protectedProcedure
    .input(z.object({ caseId: z.string(), environment: environmentSchema }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.prisma) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured' });
      }

      const corpusCase = await ctx.prisma.corpusCase.findUnique({ where: { id: input.caseId } });
      if (!corpusCase) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Corpus case not found' });
      }

      const { uid, sessionId } = await setupSyntheticSession();
      const { result, trace, activatedAgents } = await runFullPipeline({
        uid,
        sessionId,
        message: corpusCase.input,
      });

      let judge: JudgeResult | null = null;
      if (corpusCase.expected_output && result.type === 'agent_turn' && input.environment !== 'sandbox') {
        judge = await judgeReply({
          caseType: corpusCase.type,
          reply: result.message,
          expectedOutput: corpusCase.expected_output,
        });
      }

      const status: TestRunStatus =
        result.type === 'error' ? 'error' : judge?.judged && judge.passed === false ? 'warning' : 'pass';

      const run = await withEnvironment(input.environment, (tx) =>
        tx.testRun.create({
          data: {
            environment: input.environment,
            altitude: 1,
            status,
            frozen_triple: {},
            results: JSON.parse(
              JSON.stringify({
                result,
                trace,
                signals: result.signals ?? [],
                corpusCaseId: corpusCase.id,
                corpusCaseType: corpusCase.type,
                judge,
              }),
            ),
            activated_agents: activatedAgents,
            manually_selected_agents: activatedAgents,
            dependency_graph: {},
            completed_at: new Date(),
          },
        }),
      );

      return { runId: run.id, status, result, judge };
    }),
});
