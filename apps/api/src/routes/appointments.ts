import { FastifyInstance } from 'fastify';
import { verifyFirebaseJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import type { AppointmentView, AppointmentsResponse } from '@okuvu/shared-types';

interface AppointmentRow {
  id: string;
  therapist_id: string;
  scheduled_at: Date;
  duration_minutes: number;
  mode: string;
  location: string | null;
  note_to_client: string | null;
  remind_24h: boolean;
  remind_1h: boolean;
  rescheduled_from: string | null;
  cancelled_at: Date | null;
  therapist: { name: string | null };
}

// Exported for GET /users/me/today's next_appointment field (users.ts) —
// same row shape, same mapping, avoids duplicating it.
export function toView(a: AppointmentRow): AppointmentView {
  return {
    id: a.id,
    scheduledAt: a.scheduled_at.toISOString(),
    durationMinutes: a.duration_minutes,
    mode: a.mode,
    location: a.location,
    noteToClient: a.note_to_client,
    remind24h: a.remind_24h,
    remind1h: a.remind_1h,
    rescheduledFrom: a.rescheduled_from,
    cancelledAt: a.cancelled_at?.toISOString() ?? null,
    therapistId: a.therapist_id,
    therapistName: a.therapist.name,
  };
}

// App wireframes A2 — "Your sessions": own rows only, not consent-gated
// (I13). Client is read-only throughout (I10/I11) — no write routes exist
// here; all mutation stays on the therapist-portal's own appointments
// router. Split/ordering mirrors that router's listForClient exactly.
export async function appointmentsRoute(app: FastifyInstance): Promise<void> {
  app.get('/users/me/appointments', {
    preHandler: [verifyFirebaseJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;

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
      const [upcoming, past] = await Promise.all([
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
          take: 20,
          include: { therapist: { select: { name: true } } },
        }),
      ]);

      const body: AppointmentsResponse = {
        upcoming: upcoming.map(toView),
        past: past.map(toView),
      };

      reply.send(body);
    },
  });
}
