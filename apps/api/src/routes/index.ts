import { FastifyInstance } from 'fastify';
import { healthRoute } from './health.js';
import { authRoute } from './auth.js';
import { userRoute } from './users.js';
import { accountRoute } from './account.js';
import { websocketRoute } from './websocket.js';
import { sessionRoute } from './sessions.js';
import { progressRoute } from './progress.js';
import { settingsRoute } from './settings.js';
import { journalRoute } from './journal.js';
import { invitesRoute } from './invites.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoute);
  await app.register(authRoute);
  await app.register(userRoute);
  await app.register(accountRoute);
  await app.register(websocketRoute);
  await app.register(sessionRoute);
  await app.register(progressRoute);
  await app.register(settingsRoute);
  await app.register(journalRoute);
  await app.register(invitesRoute);
}
