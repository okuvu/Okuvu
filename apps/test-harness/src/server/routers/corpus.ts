import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import type { CorpusCase as PrismaCorpusCase } from '@okuvu/prisma';
import type { CorpusCase, TestRunStatus } from '@okuvu/shared-types';
import { protectedProcedure, router } from '../trpc';
import { createNewVersion } from '@/lib/corpus-versioning';
import { exportPairedComparisonRows } from '@/lib/paired-export';
import { setupSyntheticSession, runFullPipeline, type TestModeOptions } from '@/lib/pipeline-runner';
import { judgeReply, type JudgeResult } from '@/lib/judge';
import { withEnvironment } from '@/lib/prisma-rls';
import { isCannedRunActive } from '@/lib/canned-mode';
import { resolveFrozenTriple } from '@/lib/frozen-triple';
import { checkPipelineInvariants } from '@/lib/pipeline-invariants';
import { buildRunHeader } from '@/lib/run-identity';
import {
  ALL_VARIATION_KINDS,
  generateVariation,
  isDuplicateInput,
  type VariationKind,
} from '@/lib/case-factory';

const environmentSchema = z.enum(['sandbox', 'staging', 'beta']);
export const corpusCaseTypeSchema = z.enum(['safety', 'fidelity', 'adversarial', 'persona']);
export const dataOriginSchema = z.enum(['synthetic', 'paraphrased', 'real']);
export const variationKindSchema = z.enum([
  'rephrasing',
  'persona_shift',
  'intensity_shift',
  'disguised_crisis',
  'injection',
  'edge_case',
]);

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
    seedId: row.seed_id,
    adjudicationRequired: row.adjudication_required,
    languageMode: row.language_mode as 'english' | 'mirror' | null,
    homeworkContext: row.homework_context,
    toolkit: row.toolkit,
    therapistName: row.therapist_name,
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
        language_mode: z.enum(['english', 'mirror']).optional(),
        homework_context: z.string().optional(),
        toolkit: z.array(z.string()).default([]),
        therapist_name: z.string().optional(),
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
          language_mode: input.language_mode,
          homework_context: input.homework_context,
          toolkit: input.toolkit,
          therapist_name: input.therapist_name,
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
          languageMode: z.enum(['english', 'mirror']).optional(),
          homeworkContext: z.string().optional(),
          toolkit: z.array(z.string()).optional(),
          therapistName: z.string().optional(),
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
        languageMode: input.updates.languageMode,
        homeworkContext: input.updates.homeworkContext,
        toolkit: input.updates.toolkit,
        therapistName: input.updates.therapistName,
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
          language_mode: newVersion.languageMode,
          homework_context: newVersion.homeworkContext,
          toolkit: newVersion.toolkit ?? [],
          therapist_name: newVersion.therapistName,
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
      // okuvu-remaining-changes.md §E.2 — thread the case's optional
      // scenario-context fields through as testMode overrides, same
      // mechanism runPersonaScript (conversation.ts) already uses. undefined
      // for any unset field means "fall through to the pipeline's normal
      // default," not "force empty."
      const testMode: TestModeOptions = {
        injectLanguageMode: (corpusCase.language_mode as 'english' | 'mirror' | null) ?? undefined,
        injectHomework: corpusCase.homework_context ?? undefined,
        injectTherapistName: corpusCase.therapist_name ?? undefined,
        injectToolkit: corpusCase.toolkit.length > 0 ? corpusCase.toolkit : undefined,
      };
      const { result, trace, activatedAgents, workerStage } = await runFullPipeline({
        uid,
        sessionId,
        message: corpusCase.input,
        testMode,
      });

      // A fallback reply has already silently degraded — grading it against
      // clinical expectations would be meaningless (and could produce a
      // misleading 'warning' alongside the 'halt' the fallback itself earns
      // below), so judging is skipped whenever fallbackUsed is true, same as
      // it's already skipped in sandbox.
      let judge: JudgeResult | null = null;
      if (
        corpusCase.expected_output &&
        result.type === 'agent_turn' &&
        !result.fallbackUsed &&
        input.environment !== 'sandbox'
      ) {
        judge = await judgeReply({
          caseType: corpusCase.type,
          reply: result.message,
          expectedOutput: corpusCase.expected_output,
        });
      }

      // Hard-fail gating (mvp-v2-engineering-spec.md §5.1/§5.2) — same
      // priority order as pipelineRouter.runFullPipeline: error >
      // canned-hygiene/fallback/invariant hard-fail > judge-failed warning >
      // pass.
      const canned = isCannedRunActive();
      const cannedHygieneViolation = input.environment !== 'sandbox' && canned;
      const invariantViolations = checkPipelineInvariants(result.signals ?? [], result.type);

      // B1 (OKUVU — Plumbing Fixes & Rationale v1.0): a run whose A13/A15
      // worker stage failed or no-oped is marked 'incomplete' — excluded,
      // never clean. Only real-turn results have a worker stage (crisis turns
      // are persisted before any summary could run); 'error' takes priority.
      const workerStageIncomplete =
        result.type !== 'crisis' && (workerStage.attempted ? !workerStage.ok : true);

      const status: TestRunStatus =
        result.type === 'error'
          ? 'error'
          : workerStageIncomplete
            ? 'incomplete'
            : cannedHygieneViolation ||
                (result.type === 'agent_turn' && result.fallbackUsed) ||
                invariantViolations.length > 0
              ? 'halt'
              : judge?.judged && judge.passed === false
                ? 'warning'
                : 'pass';

      const run = await withEnvironment(input.environment, async (tx) => {
        const frozenTriple = await resolveFrozenTriple({
          tx,
          environment: input.environment,
          inputId: corpusCase.id,
          rawOutput: result.type === 'agent_turn' ? result.message : result.type,
        });

        return tx.testRun.create({
          data: {
            environment: input.environment,
            altitude: 1,
            status,
            canned,
            // B2: run identity header + the corpus case's own lineage version
            // as the corpus_version stamp.
            ...buildRunHeader('corpus_case', [corpusCase]),
            frozen_triple: JSON.parse(JSON.stringify(frozenTriple)),
            results: JSON.parse(
              JSON.stringify({
                result,
                trace,
                signals: result.signals ?? [],
                corpusCaseId: corpusCase.id,
                corpusCaseType: corpusCase.type,
                judge,
                invariantViolations,
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

      return { runId: run.id, status, result, judge, invariantViolations };
    }),

  /**
   * Case-factory (mvp-v2-engineering-spec.md §7): generate labelled
   * variations of a golden seed case for one or more variation kinds.
   *
   * Only a case with no seed_id of its own (a golden, hand-authored case,
   * not itself a previously-generated variant) may be used as a seed — this
   * keeps lineage exactly one level deep rather than letting variants spawn
   * further variants indefinitely.
   *
   * Each kind is generated independently and failures don't abort the
   * batch (see case-factory.ts's generateVariation doc comment). Generated
   * text is deduplicated against the seed's own input, against this seed's
   * existing variants already in the corpus, and against other variations
   * produced in this same call, before being persisted — a duplicate is
   * dropped, not created.
   */
  generateVariations: protectedProcedure
    .input(
      z.object({
        seedCaseId: z.string().min(1),
        kinds: z.array(variationKindSchema).min(1).optional(),
        environment: environmentSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.prisma) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured' });
      }
      const { prisma } = ctx;

      const seed = await prisma.corpusCase.findUnique({ where: { id: input.seedCaseId } });
      if (!seed) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Seed corpus case not found' });
      }
      if (seed.seed_id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot generate variations from a case that is itself a factory-generated variant.',
        });
      }
      assertDataOriginAllowed(seed.data_origin, input.environment);

      const kinds = input.kinds ?? ALL_VARIATION_KINDS;

      const existingVariants = await prisma.corpusCase.findMany({
        where: { seed_id: seed.id },
        select: { input: true },
      });
      const existingInputs = [seed.input, ...existingVariants.map((v) => v.input)];

      const created: CorpusCaseWithLineage[] = [];
      const duplicates: { kind: VariationKind; input: string }[] = [];
      const failed: { kind: VariationKind; reason: string }[] = [];
      const batchInputs: string[] = [];

      for (const kind of kinds) {
        const generated = await generateVariation(
          { type: seed.type, input: seed.input, expectedOutput: seed.expected_output },
          kind,
        );

        if (!('input' in generated)) {
          failed.push(generated);
          continue;
        }

        if (isDuplicateInput(generated.input, [...existingInputs, ...batchInputs])) {
          duplicates.push({ kind, input: generated.input });
          continue;
        }
        batchInputs.push(generated.input);

        const row = await prisma.corpusCase.create({
          data: {
            type: seed.type,
            input: generated.input,
            expected_output: seed.expected_output,
            tags: [...seed.tags, 'factory-generated', `variation:${kind}`],
            data_origin: seed.data_origin,
            seed_id: seed.id,
            adjudication_required: generated.adjudicationRequired,
          },
        });
        created.push(toCorpusCase(row));
      }

      return { created, duplicates, failed };
    }),

  /**
   * Review-queue extension (mvp-v2-engineering-spec.md §7 "Review-queue ...
   * adjudication of factory flags"): lists every CorpusCase still awaiting
   * human confirmation of its expected behavior after a case-factory
   * mutation (see case-factory.ts's LABEL_PRESERVING_KINDS — every kind
   * except plain rephrasing sets this). Placed on `corpus` rather than
   * `review` since this is CorpusCase-specific data that `corpus.ts` already
   * owns exclusively; `review.ts` stays scoped to BlindedReviewItem/
   * ReviewRating.
   */
  listAdjudicationQueue: protectedProcedure
    .input(z.object({ type: corpusCaseTypeSchema.optional() }).optional())
    .query(async ({ ctx, input }) => {
      if (!ctx.prisma) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured' });
      }
      const { prisma } = ctx;

      // Same "current version only" filter as listCases: a case that's been
      // superseded by a newer version (e.g. a reviewer used versionCase to
      // correct it) has naturally exited the queue, without needing this
      // procedure to also touch adjudication_required on the old row.
      const [candidates, supersededRows] = await Promise.all([
        prisma.corpusCase.findMany({
          where: {
            adjudication_required: true,
            ...(input?.type ? { type: input.type } : {}),
          },
          orderBy: { created_at: 'desc' },
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

  /**
   * Resolve one adjudication-queue item as a pure workflow-status flip —
   * same precedent as `results.ts`'s `archiveRun` (the one other place in
   * this codebase that mutates a single status-like field on an otherwise
   * append-only row, rather than creating a new version). To *correct* a
   * case's content (not just approve/reject its current content), use the
   * existing `versionCase` procedure instead — a new version's
   * `adjudication_required` naturally comes back `false` (createNewVersion
   * doesn't carry that flag forward), so a human-authored correction is
   * itself the resolution.
   *
   * Approving clears the flag with no other change. Rejecting also clears
   * the flag but tags the case `adjudication-rejected` rather than deleting
   * it — no CorpusCase row is ever deleted anywhere in this codebase, so a
   * rejected variant stays in history, just excluded from trusted use via
   * its tag.
   */
  resolveAdjudication: protectedProcedure
    .input(z.object({ caseId: z.string().min(1), approved: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.prisma) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured' });
      }

      const existing = await ctx.prisma.corpusCase.findUnique({ where: { id: input.caseId } });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Corpus case not found' });
      }
      if (!existing.adjudication_required) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This case is not awaiting adjudication.',
        });
      }

      const row = await ctx.prisma.corpusCase.update({
        where: { id: input.caseId },
        data: {
          adjudication_required: false,
          tags: input.approved ? existing.tags : [...existing.tags, 'adjudication-rejected'],
        },
      });

      return toCorpusCase(row);
    }),
});
