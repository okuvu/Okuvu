import { FastifyInstance } from 'fastify';
import { verifyOidcToken } from '../middleware/oidc-auth.js';

interface SummaryTaskPayload {
  session_id: string;
  user_id: string;
}

export async function summaryTaskRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: SummaryTaskPayload }>('/tasks/summary', {
    preHandler: [verifyOidcToken],
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

      request.log.info({
        event: 'summary_task_received',
        session_id,
        user_id,
      }, 'Summary task received');

      reply.status(200).send({ received: true });
    },
  });
}
