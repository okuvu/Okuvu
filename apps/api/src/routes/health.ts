import { FastifyInstance } from 'fastify';

export async function healthRoute(app: FastifyInstance): Promise<void> {
  app.get('/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
          },
        },
      },
    },
    handler: async (_request, reply) => {
      reply.send({
        status: 'ok',
        timestamp: new Date().toISOString(),
      });
    },
  });
}
