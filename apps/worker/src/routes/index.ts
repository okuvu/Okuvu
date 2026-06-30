import { FastifyInstance } from 'fastify';
import { cleanupRoute } from './cleanup.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(cleanupRoute);
}
