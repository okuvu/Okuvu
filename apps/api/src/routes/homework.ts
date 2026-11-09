import { FastifyInstance } from 'fastify';
import { verifyCognitoJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { isRepeatingFrequency, startOfIstDay } from '../lib/homework.js';
import type { HomeworkListItem, HomeworkListResponse } from '@okuvu/shared-types';

const LIST_LIMIT = 50;

/**
 * GET /users/me/homework — every assignment, plus the client's active reminders.
 *
 * Why this exists beside `GET /users/me/today`: the today card serves exactly
 * one active homework row (`getActiveHomework` takes the newest), so a therapist
 * who assigns three things gives the client one visible assignment and two the
 * app never shows. This route is the list the inbox links into, and it is the
 * reason an assignment notification can safely point somewhere.
 *
 * Read-only, own rows only. Completion still goes through
 * `POST /users/me/homework/:id/complete` so the existing accounting (user-
 * confirmed completion feeding the therapist's report card) stays in one place.
 */
export async function homeworkRoute(app: FastifyInstance): Promise<void> {
  app.get('/users/me/homework', {
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

      const [rows, reminderRows] = await Promise.all([
        prisma.homework.findMany({
          where: { client_user_id: user.id },
          orderBy: [{ assigned_at: 'desc' }],
          take: LIST_LIMIT,
          select: {
            id: true,
            description: true,
            status: true,
            tool_id: true,
            assigned_at: true,
            frequency: true,
            last_completed_at: true,
            tool: { select: { label: true } },
          },
        }),
        prisma.reminder.findMany({
          where: { user_id: user.id, active: true },
          orderBy: { created_at: 'desc' },
          select: {
            id: true,
            schedule_note: true,
            frequency: true,
            times: true,
            homework_id: true,
            tool: { select: { label: true } },
          },
        }),
      ]);

      const homework: HomeworkListItem[] = rows.map((row) => ({
        id: row.id,
        description: row.description,
        status: row.status,
        toolId: row.tool_id,
        toolLabel: row.tool?.label ?? null,
        assignedAt: row.assigned_at.toISOString(),
        repeats: isRepeatingFrequency(row.frequency),
        // A repeating assignment stays `active` after a completion, so the
        // list needs its own "done today" answer; without it the client sees
        // Mark done on something they already did this morning.
        doneToday:
          isRepeatingFrequency(row.frequency) &&
          row.last_completed_at !== null &&
          row.last_completed_at.getTime() >= startOfIstDay().getTime(),
      }));

      const response: HomeworkListResponse = {
        homework,
        reminders: reminderRows.map((r) => ({
          id: r.id,
          scheduleNote: r.schedule_note,
          frequency: r.frequency,
          times: r.times,
          homeworkId: r.homework_id,
          toolLabel: r.tool?.label ?? null,
        })),
      };

      return reply.send(response);
    },
  });
}
