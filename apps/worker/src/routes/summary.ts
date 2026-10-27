import { FastifyInstance } from 'fastify';
import { verifyInternalToken } from '../middleware/internal-auth.js';
import { generateSessionSummary } from '../lib/summary.js';

interface SummaryTaskPayload {
  session_id: string;
  user_id: string;
}

export async function summaryTaskRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: SummaryTaskPayload }>('/tasks/summary', {
    preHandler: [verifyInternalToken],
    schema: {
      body: {
        type: 'object',
        required: ['session_id', 'user_id'],
        properties: {
          session_id: { type: 'string' },
          user_id: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const { session_id, user_id } = request.body;
      const start = Date.now();

      request.log.info({
        event: 'summary_job_started',
        session_id,
        user_id,
      }, 'Summary job started');

      try {
        const result = await generateSessionSummary(session_id, user_id, request.log);
        const elapsed = Date.now() - start;

        request.log.info({
          event: 'summary_job_completed',
          session_id,
          user_id,
          status: result.status,
          elapsed_ms: elapsed,
        }, 'Summary job completed');

        return reply.status(200).send({ processed: true, status: result.status });
      } catch (err) {
        const elapsed = Date.now() - start;

        request.log.error({
          event: 'summary_job_failed',
          session_id,
          user_id,
          err: err instanceof Error ? err.message : String(err),
          elapsed_ms: elapsed,
        }, 'Summary job failed');

        throw err;
      }
    },
  });
}
