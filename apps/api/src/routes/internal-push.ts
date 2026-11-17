import { timingSafeEqual } from 'node:crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sendPushToUser } from '../lib/push.js';
import { sendBroadcast, validateBroadcast } from '../lib/broadcast.js';

/**
 * The internal hop the therapist portal uses to buzz a client's phone.
 *
 * Why a hop at all: the portal is where therapist actions write the
 * `Notification` row, but the FCM credential and the copy generator belong in
 * exactly one deployable. Duplicating the sender would mean two service-account
 * secrets in two task definitions and two places that can disagree about what a
 * lock screen may say. So the portal writes the row, then asks the api to send.
 *
 * Why the body names a *kind* and not a message: the api builds the copy from
 * `buildPushCopy`, so the most a caller can influence over a lock screen is
 * which generic line appears. Clinical text cannot traverse this hop even if the
 * caller wanted it to.
 *
 * Authentication is a shared secret header compared in constant time, the same
 * shape as the worker's internal jobs. The route is not registered behind
 * `verifyCognitoJWT` — it has no user session — and it is inert (503) when the
 * secret is unset, so a deployment that has not configured it cannot be driven
 * by anyone.
 *
 * Failure is deliberately invisible to the therapist: this answers 200 with the
 * send counts, and the row the client can still read in the app is unaffected.
 */

const HEADER = 'x-okuvu-internal';

interface BroadcastBody {
  kind?: unknown;
  title?: unknown;
  body?: unknown;
  campaignId?: unknown;
}

interface NotifyBody {
  userId?: unknown;
  kind?: unknown;
  appointmentAt?: unknown;
  homeworkId?: unknown;
  appointmentId?: unknown;
}

function secretMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function optionalId(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}

export async function internalPushRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: NotifyBody }>('/internal/push/notify', {
    handler: async (request: FastifyRequest<{ Body: NotifyBody }>, reply: FastifyReply) => {
      const expected = process.env.PUSH_INTERNAL_SECRET;
      if (!expected) {
        // Unconfigured, not unauthorised: nothing may drive this route, and
        // saying so plainly beats a 401 that reads like a bad credential.
        return reply
          .status(503)
          .send({ error: { code: 'PUSH_NOT_CONFIGURED', message: 'Internal push is not configured' } });
      }

      const provided = request.headers[HEADER];
      if (!secretMatches(typeof provided === 'string' ? provided : undefined, expected)) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
      }

      const userId = optionalId(request.body?.userId);
      const kind = optionalId(request.body?.kind);
      if (!userId || !kind) {
        return reply
          .status(400)
          .send({ error: { code: 'INVALID_BODY', message: 'userId and kind are required' } });
      }

      let appointmentAt: Date | null = null;
      const rawAt = request.body?.appointmentAt;
      if (typeof rawAt === 'string' && rawAt.length > 0) {
        const parsed = new Date(rawAt);
        if (!Number.isNaN(parsed.getTime())) appointmentAt = parsed;
      }

      try {
        const result = await sendPushToUser({
          userId,
          kind,
          appointmentAt,
          homeworkId: optionalId(request.body?.homeworkId),
          appointmentId: optionalId(request.body?.appointmentId),
        });
        return reply.send(result);
      } catch (err) {
        // The row is already written; a push failure never propagates.
        console.error(`[PUSH] internal send for a ${kind} notification failed`, err);
        return reply.send({ configured: true, sent: 0, failed: 1, pruned: 0 });
      }
    },
  });

  /**
   * Admin → everyone. The portal's admin procedure calls this with the admin's
   * own words; the api writes one inbox row per active client and buzzes whoever
   * has announcements on and has not already had one today.
   */
  app.post<{ Body: BroadcastBody }>('/internal/push/broadcast', {
    handler: async (request: FastifyRequest<{ Body: BroadcastBody }>, reply: FastifyReply) => {
      const expected = process.env.PUSH_INTERNAL_SECRET;
      if (!expected) {
        return reply
          .status(503)
          .send({ error: { code: 'PUSH_NOT_CONFIGURED', message: 'Internal push is not configured' } });
      }
      const provided = request.headers[HEADER];
      if (!secretMatches(typeof provided === 'string' ? provided : undefined, expected)) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
      }

      const validated = validateBroadcast(request.body ?? {});
      if ('error' in validated) {
        return reply.status(400).send({ error: { code: 'INVALID_BODY', message: validated.error } });
      }

      const campaignId = optionalId(request.body?.campaignId);
      if (!campaignId) {
        return reply
          .status(400)
          .send({ error: { code: 'INVALID_BODY', message: 'campaignId is required' } });
      }

      try {
        const result = await sendBroadcast({ ...validated, campaignId });
        return reply.send(result);
      } catch (err) {
        console.error('[PUSH] broadcast failed', err);
        return reply
          .status(500)
          .send({ error: { code: 'BROADCAST_FAILED', message: 'Broadcast could not be sent' } });
      }
    },
  });
}
