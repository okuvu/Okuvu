import { FastifyInstance } from 'fastify';
import { getPrisma } from '../lib/prisma.js';
import { getSummaryConsumerStatus } from '../lib/summary-consumer.js';

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
 * needs no signature header — its whole job is to answer "is the worker up" cheaply. It
 * also reports DB reachability so a caller can distinguish "worker process up
 * but database down" (also unusable for summary generation).
 *
 * A6 adds `summary_consumer`. That report is deliberately part of the same
 * unauthenticated answer: the beta's original failure was a worker that was
 * healthy, serving HTTP, and receiving nothing, so "up" without "fed" is the
 * half-answer that let session summaries silently never exist. The counters are
 * process-lifetime, not persisted — they answer "has this task polled since it
 * started", which is the question a restart makes.
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
            summary_consumer: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                running: { type: 'boolean' },
                queue_url: { type: 'string', nullable: true },
                receipts: { type: 'integer' },
                processed: { type: 'integer' },
                discarded: { type: 'integer' },
                failed: { type: 'integer' },
                last_poll_at: { type: 'string', nullable: true },
                last_message_at: { type: 'string', nullable: true },
                last_error: { type: 'string', nullable: true },
              },
            },
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
        summary_consumer: getSummaryConsumerStatus(),
      });
    },
  });
}
