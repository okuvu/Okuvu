import { FastifyInstance } from 'fastify';
import { verifyInternalToken } from '../middleware/internal-auth.js';
import {
  reminderConfigFromEnv,
  runWorryTimeReminders,
} from '../lib/worry-time-reminders.js';

/**
 * Ops trigger for the daily worry-time reminder sweep.
 *
 * The scheduler in server.ts is the normal caller; this route exists so an
 * operator can run the same sweep on demand (after a deploy, or after a day's
 * timer was lost with the task) without waiting for the next IST evening.
 * Guarded by the worker's existing internal-auth middleware, exactly like
 * `/tasks/summary`, and idempotence stays with the api: the sweep sends at most
 * one email per client per IST day no matter how often this is called.
 *
 * When `WORRY_REMINDER_COPY_APPROVED` is false this returns 200 with
 * `status: 'copy_not_approved'` — that is a deliberate no-op, not an error.
 * A missing secret or api URL is 503 (same code the api uses for its own
 * unconfigured state); an api failure is 502 so an operator sees it as one.
 */
export async function worryTimeReminderRoute(app: FastifyInstance): Promise<void> {
  app.post('/tasks/worry-time-reminders', {
    preHandler: [verifyInternalToken],
    handler: async (request, reply) => {
      const config = reminderConfigFromEnv();

      const result = await runWorryTimeReminders({
        apiBaseUrl: config.apiBaseUrl,
        internalSecret: config.internalSecret,
        log: request.log,
      });

      if (result.status === 'not_configured') {
        return reply.status(503).send({
          error: { code: 'NOT_CONFIGURED', message: `${result.missing} is not set` },
        });
      }
      if (result.status === 'failed') {
        return reply.status(502).send({
          status: result.status,
          reason: result.reason,
          ...(result.http_status !== undefined ? { http_status: result.http_status } : {}),
        });
      }

      return reply.status(200).send(result);
    },
  });
}
