import { FastifyInstance } from 'fastify';
import { verifyCognitoJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import {
  clampListLimit,
  countUnread,
  listNotifications,
  markAllRead,
  markNotificationRead,
} from '../lib/notifications.js';

interface ListQuery {
  limit?: string;
  before?: string;
}

/**
 * The client's own notification inbox.
 *
 * Read-only from the app's side except for the two mark-read calls. Everything
 * here is scoped to the authenticated user's rows — there is no route that takes
 * another user's id, on purpose: an inbox is a list of what a therapist sent a
 * specific person, and a guessed id must not open someone else's.
 */
export async function notificationsRoute(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: ListQuery }>('/users/me/notifications', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;

      const limitResult = clampListLimit(request.query.limit);
      if ('error' in limitResult) {
        return reply.status(400).send({
          error: { code: 'INVALID_LIMIT', message: limitResult.error },
        });
      }

      let before: Date | undefined;
      if (request.query.before !== undefined) {
        const parsed = new Date(request.query.before);
        if (Number.isNaN(parsed.getTime())) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_BEFORE',
              message: 'before must be an ISO 8601 timestamp',
            },
          });
        }
        before = parsed;
      }

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      const result = await listNotifications({
        clientUserId: user.id,
        limit: limitResult.limit,
        before,
      });

      return reply.send(result);
    },
  });

  // Kept separate from the list so the bell can refresh its badge without
  // pulling 30 rows it will not render (Home polls it on every resume).
  app.get('/users/me/notifications/unread-count', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      return reply.send({ unreadCount: await countUnread(user.id) });
    },
  });

  app.post<{ Params: { id: string } }>('/users/me/notifications/:id/read', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      const result = await markNotificationRead(user.id, request.params.id);

      if (result.status === 'not_found') {
        // 404 rather than 403: a row that belongs to someone else must be
        // indistinguishable from one that does not exist.
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Notification not found' },
        });
      }

      return reply.send({ success: true });
    },
  });

  app.post('/users/me/notifications/read-all', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      const updated = await markAllRead(user.id);
      return reply.send({ success: true, updated });
    },
  });
}
