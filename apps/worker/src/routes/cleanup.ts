import { FastifyInstance } from 'fastify';
import { verifyOidcToken } from '../middleware/oidc-auth.js';
import { getPrisma } from '../lib/prisma.js';

interface CleanupQuery {
  retention_days?: string;
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

      const now = new Date();
      const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const cutoff = new Date(todayUTC.getTime() - retentionDays * 24 * 60 * 60 * 1000);

      const result = await getPrisma().sessionLimit.deleteMany({
        where: {
          date_ist: {
            lt: cutoff,
          },
        },
      });

      request.log.info(
        {
          deleted: result.count,
          retention_days: retentionDays,
          cutoff_date: cutoff.toISOString().slice(0, 10),
        },
        'Session limits cleanup completed',
      );

      reply.send({
        deleted: result.count,
        retention_days: retentionDays,
        cutoff_date: cutoff.toISOString().slice(0, 10),
      });
    },
  });
}
