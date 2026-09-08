import { FastifyInstance } from 'fastify';
import { verifyOidcToken } from '../middleware/oidc-auth.js';
import { getPrisma } from '../lib/prisma.js';
import { generateSessionSummary } from '../lib/summary.js';
import { getISTDateString } from '@okuvu/shared-types';

const STALE_PENDING_MINUTES = 60;

interface CleanupQuery {
  retention_days?: string;
}

interface SummaryReprocessBody {
  max_records?: number;
}

export async function cleanupRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Querystring: CleanupQuery }>('/cleanup/session-limits', {
    preHandler: [verifyOidcToken],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          retention_days: { type: 'string', pattern: '^\\d+$' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            deleted: { type: 'integer' },
            retention_days: { type: 'integer' },
            cutoff_date: { type: 'string' },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const retentionDays = parseInt(request.query.retention_days ?? '30', 10);

      const cutoffDate = new Date(
        Date.now() - retentionDays * 24 * 60 * 60 * 1000,
      );
      const cutoffIST = getISTDateString(cutoffDate);

      const result = await getPrisma().sessionLimit.deleteMany({
        where: {
          date_ist: {
            lt: cutoffIST,
          },
        },
      });

      request.log.info(
        {
          deleted: result.count,
          retention_days: retentionDays,
          cutoff_date: cutoffIST,
        },
        'Session limits cleanup completed',
      );

      reply.send({
        deleted: result.count,
        retention_days: retentionDays,
        cutoff_date: cutoffIST,
      });
    },
  });

  app.post<{ Body: SummaryReprocessBody }>('/cleanup/summary-reprocess', {
    preHandler: [verifyOidcToken],
    schema: {
      body: {
        type: 'object',
        properties: {
          max_records: { type: 'number', minimum: 1, maximum: 100 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            reprocessed: { type: 'integer' },
            succeeded: { type: 'integer' },
            failed: { type: 'integer' },
            skipped: { type: 'integer' },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const maxRecords = request.body.max_records ?? 20;

      const staleCutoff = new Date(Date.now() - STALE_PENDING_MINUTES * 60 * 1000);

      const staleRecords = await getPrisma().sessionSummary.findMany({
        where: {
          OR: [
            { status: 'FAILED' },
            { status: 'PENDING', created_at: { lt: staleCutoff } },
          ],
        },
        take: maxRecords,
        orderBy: { created_at: 'asc' },
      });

      request.log.info({
        event: 'summary_reprocess_started',
        stale_count: staleRecords.length,
        max_records: maxRecords,
      }, 'Reprocessing stale summary records');

      let succeeded = 0;
      let failed = 0;

      for (const record of staleRecords) {
        try {
          await generateSessionSummary(record.session_id, record.user_id, request.log);
          succeeded++;
        } catch {
          failed++;
        }
      }

      const skipped = staleRecords.length - succeeded - failed;

      request.log.info({
        event: 'summary_reprocess_completed',
        total: staleRecords.length,
        succeeded,
        failed,
      }, 'Summary reprocess completed');

      reply.send({
        reprocessed: staleRecords.length,
        succeeded,
        failed,
        skipped,
      });
    },
  });
}
