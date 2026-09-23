import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../trpc';
import { withEnvironment, withAllEnvironments, type TestEnvironment } from '../../lib/prisma-rls';
import { buildRunsWorkbook, MAX_EXPORT_ROWS, type ExportRunRow } from '../../lib/workbook-export';

/**
 * TH-S38 — bulk .xlsx export of run outputs (`results` router extension).
 *
 * Scope selectors (spec TH-S38): a run group, a persona, a date range, or
 * all runs in an environment. The router returns the row count first when
 * `dryRun` is set (the UI shows it before generating), and builds the
 * workbook otherwise — bounded to MAX_EXPORT_ROWS runs.
 */

const exportScopeSchema = z.object({
  environment: z.enum(['sandbox', 'staging', 'beta']).optional(),
  /** ConversationRun group id — exports every run_ids member. */
  runGroupId: z.string().optional(),
  personaId: z.string().optional(),
  /** ISO date bounds (inclusive), applied to created_at. */
  fromIso: z.string().datetime().optional(),
  toIso: z.string().datetime().optional(),
  /** Preview the row count without building the workbook. */
  dryRun: z.boolean().default(false),
});

export const resultsExportRouter = router({
  exportRuns: protectedProcedure.input(exportScopeSchema).mutation(async ({ input }) => {
    // Resolve run-group scope first (the group pins its member run ids).
    // conversationRun rows are RLS-unscoped test-harness tables, so a direct
    // read via withAllEnvironments's transaction client works here; the row
    // type comes back as the full model.
    let groupRunIds: string[] | null = null;
    let groupPersonaId: string | null = null;
    if (input.runGroupId) {
      const group = await withAllEnvironments(async (tx) => {
        const found = await (tx as unknown as {
          conversationRun: { findUnique: (args: { where: { id: string } }) => Promise<{ run_ids: string[]; persona_id: string } | null> };
        }).conversationRun.findUnique({ where: { id: input.runGroupId ?? '' } });
        return found ? [found] : [];
      });
      if (group.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `No ConversationRun group '${input.runGroupId}'` });
      }
      groupRunIds = group[0].run_ids;
      groupPersonaId = group[0].persona_id;
    }

    const where: Record<string, unknown> = {};
    if (groupRunIds) {
      where.id = { in: groupRunIds };
    } else {
      if (input.personaId || groupPersonaId) {
        where.persona_id = input.personaId ?? groupPersonaId;
      }
      if (input.fromIso || input.toIso) {
        where.created_at = {
          ...(input.fromIso ? { gte: new Date(input.fromIso) } : {}),
          ...(input.toIso ? { lte: new Date(input.toIso) } : {}),
        };
      }
    }

    const fetchRuns = (tx: {
      testRun: { findMany: (args: Record<string, unknown>) => Promise<ExportRunRow[]> };
    }) =>
      tx.testRun.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: MAX_EXPORT_ROWS,
      });

    // The findMany where-clause carries environment directly when scoped
    // (withAllEnvironments path needs it per-environment); when the caller
    // passed an explicit environment, use the RLS-scoped single-env path.
    const runs: ExportRunRow[] = input.environment
      ? await withEnvironment(input.environment, (tx) => fetchRuns(tx as unknown as Parameters<typeof fetchRuns>[0]))
      : await withAllEnvironments((tx) => fetchRuns(tx as unknown as Parameters<typeof fetchRuns>[0]));

    if (input.dryRun) {
      return {
        dryRun: true as const,
        runCount: runs.length,
        maxRows: MAX_EXPORT_ROWS,
        truncated: runs.length >= MAX_EXPORT_ROWS,
      };
    }

    if (runs.length === 0) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No runs match the requested scope — nothing to export.' });
    }

    const { buffer, rowCount, truncated, summaryRows, turnRows, sessionRows } = buildRunsWorkbook({ runs });

    return {
      dryRun: false as const,
      fileName: `okuvu-runs-export-${new Date().toISOString().slice(0, 10)}.xlsx`,
      base64: buffer.toString('base64'),
      rowCount,
      truncated,
      sheets: { summary: summaryRows, turns: turnRows, sessions: sessionRows },
    };
  }),
});
