import { FastifyInstance } from 'fastify';
import { healthRoute } from './health.js';
import { authRoute } from './auth.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoute);
  await app.register(authRoute);
}
