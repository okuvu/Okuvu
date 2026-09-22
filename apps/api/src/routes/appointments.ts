import { FastifyInstance } from 'fastify';
import { verifyFirebaseJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { toView } from '../lib/appointments.js';
import type { AppointmentsResponse } from '@okuvu/shared-types';

// Relocated to lib/appointments.ts (also consumed by lib/today-card.ts's
// next_appointment field) — re-exported here so any existing import of
// `toView` from this route file keeps working.
export { toView };

// `upcoming` isn't paginated — a client only ever has a handful of future
// sessions booked at once, no real growth vector. `past` is the one that
// grows unbounded with tenure, so only it takes limit/offset params.
const PAST_LIMIT_DEFAULT = 20;
const PAST_LIMIT_MIN = 1;
const PAST_LIMIT_MAX = 50;
const PAST_OFFSET_DEFAULT = 0;

interface AppointmentsQuery {
  past_limit?: string;
  past_offset?: string;
}

// App wireframes A2 — "Your sessions": own rows only, not consent-gated
// (I13). Client is read-only throughout (I10/I11) — no write routes exist
// here; all mutation stays on the therapist-portal's own appointments
// router. Split/ordering mirrors that router's listForClient exactly.
export async function appointmentsRoute(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: AppointmentsQuery }>('/users/me/appointments', {
    preHandler: [verifyFirebaseJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;

      let pastLimit = PAST_LIMIT_DEFAULT;
      if (request.query.past_limit !== undefined) {
        pastLimit = parseInt(request.query.past_limit, 10);
        if (isNaN(pastLimit) || !Number.isInteger(pastLimit) || pastLimit < PAST_LIMIT_MIN || pastLimit > PAST_LIMIT_MAX) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_PAST_LIMIT',
              message: `past_limit must be an integer between ${PAST_LIMIT_MIN} and ${PAST_LIMIT_MAX}`,
            },
          });
        }
      }

      let pastOffset = PAST_OFFSET_DEFAULT;
      if (request.query.past_offset !== undefined) {
        pastOffset = parseInt(request.query.past_offset, 10);
        if (isNaN(pastOffset) || !Number.isInteger(pastOffset) || pastOffset < 0) {
          return reply.status(400).send({
            error: { code: 'INVALID_PAST_OFFSET', message: 'past_offset must be a non-negative integer' },
          });
        }
      }

      const user = await prisma.user.findUnique({
        where: { firebase_uid: uid },
        select: { id: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      const now = new Date();
      const [upcoming, pastPage] = await Promise.all([
        prisma.appointment.findMany({
          where: { client_user_id: user.id, scheduled_at: { gte: now }, cancelled_at: null },
          orderBy: { scheduled_at: 'asc' },
          include: { therapist: { select: { name: true } } },
        }),
        prisma.appointment.findMany({
          where: {
            client_user_id: user.id,
            OR: [{ scheduled_at: { lt: now } }, { cancelled_at: { not: null } }],
          },
          orderBy: { scheduled_at: 'desc' },
          skip: pastOffset,
          // Fetch one extra row to learn whether another page exists without
          // a separate COUNT query — sliced back off below before mapping.
          take: pastLimit + 1,
          include: { therapist: { select: { name: true } } },
        }),
      ]);

      const pastHasMore = pastPage.length > pastLimit;
      const past = pastHasMore ? pastPage.slice(0, pastLimit) : pastPage;

      const body: AppointmentsResponse = {
        upcoming: upcoming.map(toView),
        past: past.map(toView),
        pastHasMore,
      };

      reply.send(body);
    },
  });
}
