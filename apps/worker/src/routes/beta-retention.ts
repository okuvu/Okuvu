import { FastifyInstance } from 'fastify';
import { verifyInternalToken } from '../middleware/internal-auth.js';
import { getPrisma } from '../lib/prisma.js';

/**
 * TH-S31 — beta environment data retention cleanup job.
 *
 * Mirrors `cleanup.ts`'s structure (signature-protected via `verifyInternalToken`,
 * Fastify route registration pattern, `retention_days` querystring). Per
 * ADR-013 (docs/adr/013-test-harness-beta-retention.md): beta-scoped
 * `TestRun` and `CorpusCase` rows older than `BETA_RETENTION_DAYS`
 * (default 90) are eligible for deletion.
 *
 * `dry_run` defaults to `true` — this deletes production-adjacent,
 * potentially real-user-derived data, so an accidental invocation without
 * an explicit `dry_run=false` must never delete anything. Only an explicit
 * `dry_run=false` query param performs real deletes.
 *
 * SCOPE NOTE — CorpusCase has no `environment` column (see
 * packages/prisma/migrations/manual/001_test_harness_beta_rls.sql's header
 * comment for the full reasoning: adding one was judged out of scope for
 * this story). "Beta-scoped CorpusCase rows" is therefore approximated here
 * as `data_origin = 'real'`, since `corpusRouter.assertDataOriginAllowed()`
 * (apps/test-harness/src/server/routers/corpus.ts) already restricts
 * `data_origin: 'real'` to being created only when `environment === 'beta'`.
 * That is an application-level invariant, not a DB-level guarantee — flagged
 * here and in docs/test-harness/ethics-review-prep.md as a follow-up gap.
 *
 * TestRun has a `TestResultRow[]` child relation with no cascade delete
 * configured in schema.prisma, so a real (non-dry-run) delete removes each
 * beta TestRun's TestResultRow children first to avoid a foreign-key
 * violation.
 */

const DEFAULT_RETENTION_DAYS = 90;

interface BetaRetentionQuery {
  retention_days?: string;
  dry_run?: string;
}

function resolveRetentionDays(queryValue: string | undefined): number {
  if (queryValue !== undefined) {
    return parseInt(queryValue, 10);
  }
  const envValue = process.env.BETA_RETENTION_DAYS;
  if (envValue && /^\d+$/.test(envValue)) {
    return parseInt(envValue, 10);
  }
  return DEFAULT_RETENTION_DAYS;
}

/** Only an explicit `dry_run=false` disables dry-run mode; everything else (including omission) is a dry run. */
function resolveDryRun(queryValue: string | undefined): boolean {
  return queryValue !== 'false';
}

export async function betaRetentionRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Querystring: BetaRetentionQuery }>('/cleanup/beta-retention', {
    preHandler: [verifyInternalToken],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          retention_days: { type: 'string', pattern: '^\\d+$' },
          dry_run: { type: 'string', enum: ['true', 'false'] },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            dry_run: { type: 'boolean' },
            retention_days: { type: 'integer' },
            cutoff_date: { type: 'string' },
            test_run: {
              type: 'object',
              properties: {
                matched: { type: 'integer' },
                deleted: { type: 'integer' },
              },
            },
            corpus_case: {
              type: 'object',
              properties: {
                matched: { type: 'integer' },
                deleted: { type: 'integer' },
              },
            },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const retentionDays = resolveRetentionDays(request.query.retention_days);
      const dryRun = resolveDryRun(request.query.dry_run);
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      const prisma = getPrisma();

      const staleTestRuns = await prisma.testRun.findMany({
        where: { environment: 'beta', created_at: { lt: cutoffDate } },
        select: { id: true },
      });

      const staleCorpusCases = await prisma.corpusCase.findMany({
        where: { data_origin: 'real', created_at: { lt: cutoffDate } },
        select: { id: true },
      });

      request.log.info(
        {
          event: 'beta_retention_scan',
          dry_run: dryRun,
          retention_days: retentionDays,
          cutoff_date: cutoffDate.toISOString(),
          test_run_matched: staleTestRuns.length,
          corpus_case_matched: staleCorpusCases.length,
        },
        'Beta retention scan completed',
      );

      let testRunDeleted = 0;
      let corpusCaseDeleted = 0;

      if (!dryRun) {
        const runIds = staleTestRuns.map((r) => r.id);
        const caseIds = staleCorpusCases.map((c) => c.id);

        if (runIds.length > 0) {
          // Child TestResultRow rows have no cascade delete configured on
          // the TestRun relation, so they must be removed first or the
          // TestRun deletes below would fail on the FK constraint.
          await prisma.testResultRow.deleteMany({ where: { run_id: { in: runIds } } });
          const result = await prisma.testRun.deleteMany({ where: { id: { in: runIds } } });
          testRunDeleted = result.count;
        }

        if (caseIds.length > 0) {
          const result = await prisma.corpusCase.deleteMany({ where: { id: { in: caseIds } } });
          corpusCaseDeleted = result.count;
        }

        request.log.info(
          {
            event: 'beta_retention_deleted',
            test_run_deleted: testRunDeleted,
            corpus_case_deleted: corpusCaseDeleted,
          },
          'Beta retention cleanup completed',
        );
      }

      reply.send({
        dry_run: dryRun,
        retention_days: retentionDays,
        cutoff_date: cutoffDate.toISOString(),
        test_run: { matched: staleTestRuns.length, deleted: testRunDeleted },
        corpus_case: { matched: staleCorpusCases.length, deleted: corpusCaseDeleted },
      });
    },
  });
}
