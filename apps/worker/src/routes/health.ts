import { FastifyInstance } from 'fastify';
import { getPrisma } from '../lib/prisma.js';

/**
 * A1 (OKUVU — Plumbing Fixes & Rationale v1.0): the summary/memory worker
 * (this app) was silently unreachable in every environment — A13/A15 returned
 * "WORKER_URL is not configured", processed:false, and nothing noticed. A2
 * then had no continuity to read at all, which is the structural root of the
 * reset-on-affirmation failures.
 *
 * This route is the reachable, unauthenticated health surface the API and the
 * test harness assert against at startup (see apps/api/src/lib/worker-health.ts
 * and apps/test-harness/src/lib/worker-health.ts). Unlike /tasks/summary it
 * needs no OIDC — its whole job is to answer "is the worker up" cheaply. It
 * also reports DB reachability so a caller can distinguish "worker process up
 * but database down" (also unusable for summary generation).
 */
export async function healthRoute(app: FastifyInstance): Promise<void> {
  app.get('/health', {
    // Explicitly excluded from any serialisation confusion: this is a plain
    // status endpoint, mirroring apps/api's /health shape plus a db sub-check.
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            db: { type: 'string' },
            timestamp: { type: 'string' },
          },
        },
      },
    },
    handler: async (_request, reply) => {
      let db: 'ok' | 'unreachable' = 'ok';
      try {
        await getPrisma().$queryRaw`SELECT 1`;
      } catch {
        db = 'unreachable';
      }

      // 200 while the process itself is up; callers decide whether `db` state
      // is fatal for their purposes. The assertion helpers treat
      // network-unreachable and non-200 as the loud failure; a 200 with
      // db:'unreachable' is logged by the caller.
      reply.send({
        status: 'ok',
        db,
        timestamp: new Date().toISOString(),
      });
    },
  });
}
