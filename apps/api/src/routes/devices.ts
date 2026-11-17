import { FastifyInstance } from 'fastify';
import { verifyCognitoJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

/**
 * Device registration — the address book the push sender reads.
 *
 * Two calls, both body-only and both idempotent, because the app calls them on
 * events it cannot see the outcome of (app open, sign-out) and a duplicate must
 * be harmless:
 *
 * - `POST /devices` registers or refreshes this handset's FCM token.
 * - `DELETE /devices` forgets it on sign-out. A shared phone must stop receiving
 *   the previous account's alerts the moment someone else signs in, and the
 *   delete is scoped to the authenticated user so one client cannot unregister
 *   another's phone.
 *
 * `user_id` is reassigned on upsert rather than left alone. FCM tokens are
 * per-install, so signing out and back in as a different account on the same
 * handset mints the same token again; leaving the old owner on the row would
 * deliver the new account's alerts into the old account's phone.
 */

const MAX_TOKEN_LENGTH = 4096;
const PLATFORMS = new Set(['android']);

interface RegisterBody {
  token?: unknown;
  platform?: unknown;
}

function normaliseToken(raw: unknown): { token: string } | { error: string } {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { error: 'token is required' };
  }
  const token = raw.trim();
  if (token.length > MAX_TOKEN_LENGTH) return { error: 'token is too long' };
  return { token };
}

export async function devicesRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: RegisterBody }>('/devices', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const parsed = normaliseToken(request.body?.token);
      if ('error' in parsed) {
        return reply.status(400).send({ error: { code: 'INVALID_TOKEN', message: parsed.error } });
      }

      const platformRaw = request.body?.platform;
      const platform = typeof platformRaw === 'string' ? platformRaw : 'android';
      if (!PLATFORMS.has(platform)) {
        return reply
          .status(400)
          .send({ error: { code: 'INVALID_PLATFORM', message: 'platform must be android' } });
      }

      const user = await prisma.user.findUnique({
        where: { auth_subject: request.user.uid },
        select: { id: true },
      });
      if (!user) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
      }

      await prisma.deviceToken.upsert({
        where: { token: parsed.token },
        create: { user_id: user.id, token: parsed.token, platform },
        // A re-registration is also how a handset changes hands, so the owner is
        // rewritten rather than assumed.
        update: { user_id: user.id, last_seen_at: new Date(), platform },
      });

      return reply.status(204).send();
    },
  });

  app.delete<{ Body: RegisterBody }>('/devices', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const parsed = normaliseToken(request.body?.token);
      if ('error' in parsed) {
        return reply.status(400).send({ error: { code: 'INVALID_TOKEN', message: parsed.error } });
      }

      const user = await prisma.user.findUnique({
        where: { auth_subject: request.user.uid },
        select: { id: true },
      });
      if (!user) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
      }

      await prisma.deviceToken.deleteMany({
        where: { token: parsed.token, user_id: user.id },
      });

      return reply.status(204).send();
    },
  });
}
