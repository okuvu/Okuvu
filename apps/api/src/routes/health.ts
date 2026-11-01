import { FastifyInstance } from 'fastify';

/**
 * The git commit the running image was built from.
 *
 * ECS injects GIT_COMMIT from the task definition, where Terraform (and the
 * build pipeline's task-definition pinning) set it to the image tag — i.e. the
 * same commit SHA the image is tagged with. Read per request rather than once
 * at module load, so the value always reflects the live environment.
 */
export function resolveCommit(): string {
  const commit = process.env.GIT_COMMIT?.trim();
  return commit && commit.length > 0 ? commit : 'unknown';
}

export async function healthRoute(app: FastifyInstance): Promise<void> {
  app.get('/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            // Must be declared here too: Fastify's response serializer drops
            // any property that is absent from the schema.
            commit: { type: 'string' },
          },
        },
      },
    },
    handler: async (_request, reply) => {
      reply.send({
        status: 'ok',
        timestamp: new Date().toISOString(),
        commit: resolveCommit(),
      });
    },
  });
}
