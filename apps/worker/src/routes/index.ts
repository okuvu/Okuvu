import { FastifyInstance } from 'fastify';
import { cleanupRoute } from './cleanup.js';
import { summaryTaskRoute } from './summary.js';
import { betaRetentionRoute } from './beta-retention.js';
import { healthRoute } from './health.js';
import { worryTimeReminderRoute } from './worry-time-reminders.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(cleanupRoute);
  await app.register(summaryTaskRoute);
  await app.register(betaRetentionRoute);
  await app.register(worryTimeReminderRoute);
  await app.register(healthRoute);
}
