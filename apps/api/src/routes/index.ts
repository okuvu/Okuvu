import { FastifyInstance } from 'fastify';
import { healthRoute } from './health.js';
import { authRoute } from './auth.js';
import { userRoute } from './users.js';
import { websocketRoute } from './websocket.js';
import { sessionRoute } from './sessions.js';
import { progressRoute } from './progress.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoute);
  await app.register(authRoute);
  await app.register(userRoute);
  await app.register(websocketRoute);
  await app.register(sessionRoute);
  await app.register(progressRoute);
}
