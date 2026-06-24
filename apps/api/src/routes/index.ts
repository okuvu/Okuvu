import { FastifyInstance } from 'fastify';
import { healthRoute } from './health.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoute);
}
