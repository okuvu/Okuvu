import { FastifyInstance } from 'fastify';
import { cleanupRoute } from './cleanup.js';
import { summaryTaskRoute } from './summary.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(cleanupRoute);
  await app.register(summaryTaskRoute);
}
