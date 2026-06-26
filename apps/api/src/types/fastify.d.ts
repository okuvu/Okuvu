import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user: { uid: string };
  }
}
