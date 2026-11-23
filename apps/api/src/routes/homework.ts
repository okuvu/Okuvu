import { FastifyInstance } from 'fastify';
import { verifyCognitoJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { completePracticeForTool, isRepeatingFrequency, startOfIstDay } from '../lib/homework.js';
import type {
  HomeworkListItem,
  HomeworkListResponse,
  HomeworkPracticeCompleteResponse,
} from '@okuvu/shared-types';

const LIST_LIMIT = 50;
const TOOL_ID_PATTERN = /^[a-z0-9_]{1,64}$/;

/**
 * GET /users/me/homework — every assignment, plus the client's active reminders.
 *
 * Why this exists beside `GET /users/me/today`: the today card serves exactly
 * one active homework row (`getActiveHomework` takes the newest), so a therapist
 * who assigns three things gives the client one visible assignment and two the
 * app never shows. This route is the list the inbox links into, and it is the
 * reason an assignment notification can safely point somewhere.
 *
 * Read-only, own rows only. There is no route that records a completion from a
 * tap: an exercise assignment closes when its player reaches the end
 * (`POST /users/me/homework/practice-complete`), a worksheet assignment closes
 * when the worksheet is saved, and typed homework has no in-app proof at all so
 * the therapist closes it from the portal.
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

  /**
   * POST /users/me/homework/practice-complete — the app's player finished an
   * exercise, so the matching assignment is done.
   *
   * Deliberately not `/:id/complete`: there is no longer a route a client can
   * call for an arbitrary assignment, which is the whole point of removing the
   * Mark done button. This one only ever closes an assignment the caller is
   * actually holding for that exercise, and only once per IST day.
   *
   * A tool that is not assigned answers 200 with `completed: false` rather than
   * 404: a client practising box breathing from the chat or the Breathe tab has
   * nothing to complete, and that is an ordinary thing to do, not an error the
   * app should surface.
   */
  app.post('/users/me/homework/practice-complete', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const body = (request.body ?? {}) as { toolId?: unknown };

      if (typeof body.toolId !== 'string' || !TOOL_ID_PATTERN.test(body.toolId)) {
        return reply.status(400).send({
          error: { code: 'INVALID_TOOL_ID', message: 'toolId must be a tool id, e.g. box_breathing' },
        });
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

      const result = await completePracticeForTool(user.id, body.toolId);

      const payload: HomeworkPracticeCompleteResponse =
        result.outcome === 'completed'
          ? {
              completed: true,
              reason: null,
              homeworkId: result.homeworkId,
              repeats: result.repeats,
              nextDueAt: result.nextDueAt,
            }
          : {
              completed: false,
              reason: result.outcome,
              homeworkId: result.outcome === 'already_done_today' ? result.homeworkId : null,
              repeats: false,
              nextDueAt: null,
            };

      if (result.outcome === 'completed') {
        request.log.info(
          { event: 'homework_practice_completed', homework_id: result.homeworkId, tool_id: body.toolId },
          'Client finished an assigned exercise',
        );
      }

      return reply.send(payload);
    },
  });
}
