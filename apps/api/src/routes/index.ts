import { FastifyInstance } from 'fastify';
import { healthRoute } from './health.js';
import { authRoute } from './auth.js';
import { userRoute } from './users.js';
import { websocketRoute } from './websocket.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoute);
  await app.register(authRoute);
  await app.register(userRoute);
  await app.register(websocketRoute);
}
