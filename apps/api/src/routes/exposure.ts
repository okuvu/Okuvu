import { FastifyInstance } from 'fastify';
import {
  EXPOSURE_PAUSE_GROUNDING_TOOL_ID,
  EXPOSURE_PAUSE_MESSAGE,
  exposurePauseNeeded,
} from '@okuvu/shared-types/safety';
import { verifyCognitoJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

/**
 * The client's half of the exposure ladder.
 *
 * The owner's rule (24 Nov 2026) is that this is the therapist's tool: the
 * worksheet row is `therapist_only`, it is never a Library card, it cannot be
 * assigned, and the chat never suggests it. This route is therefore the only
 * way a client sees anything from it, and it answers with **unlocked steps
 * only** — a step the therapist has not unlocked does not exist for this door,
 * and a direct request for it answers 404 exactly as an unknown id does.
 *
 * The client's ratings are their own numbers at two moments, shown as chosen.
 * Nothing subtracts them. A `before` of 80 or more comes back with the pause
 * flag, the approved-in-draft pause line and the existing grounding exercise —
 * the client's next move is theirs, and the step keeps whatever state the
 * therapist set.
 */

interface RunBody {
  before?: unknown;
  after?: unknown;
}

function rating(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 0 || value > 100) return null;
  return value;
}

export async function exposureRoute(app: FastifyInstance): Promise<void> {
  /** The unlocked steps, with the client's most recent rating of each. */
  app.get('/exposure-ladder', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });
      if (!user) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
      }

      const steps = await prisma.exposureStep.findMany({
        where: { client_user_id: user.id, unlocked_at: { not: null } },
        orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
        select: {
          id: true,
          label: true,
          difficulty: true,
          position: true,
          runs: {
            orderBy: { created_at: 'desc' },
            take: 1,
            select: { before: true, after: true, created_at: true },
          },
        },
      });

      return reply.send({
        steps: steps.map((step) => {
          const last = step.runs[0] ?? null;
          return {
            id: step.id,
            label: step.label,
            difficulty: step.difficulty,
            position: step.position,
            lastRun: last
              ? { before: last.before, after: last.after, createdAt: last.created_at.toISOString() }
              : null,
          };
        }),
      });
    },
  });

  /** Rate an unlocked step. Before is the rating that can bring up the pause. */
  app.post<{ Params: { stepId: string }; Body: RunBody }>('/exposure-ladder/:stepId/run', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const body = request.body ?? {};

      const before = rating(body.before);
      if (before === null) {
        return reply.status(400).send({
          error: { code: 'INVALID_BEFORE', message: 'How difficult does it feel, 0 to 100?' },
        });
      }
      const after = body.after === undefined || body.after === null ? null : rating(body.after);
      if (body.after !== undefined && body.after !== null && after === null) {
        return reply.status(400).send({
          error: { code: 'INVALID_AFTER', message: 'How difficult did it feel, 0 to 100?' },
        });
      }

      const user = await prisma.user.findUnique({
        where: { auth_subject: uid },
        select: { id: true },
      });
      if (!user) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
      }

      // Unlocked and theirs, or it does not exist. A locked step is not "not
      // allowed" — it is invisible, which is the owner's rule for this surface.
      const step = await prisma.exposureStep.findFirst({
        where: { id: request.params.stepId, client_user_id: user.id, unlocked_at: { not: null } },
        select: { id: true },
      });
      if (!step) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Not found' } });
      }

      const run = await prisma.exposureStepRun.create({
        data: { step_id: step.id, client_user_id: user.id, before, after },
        select: { id: true, created_at: true },
      });

      const pause = exposurePauseNeeded(before);

      return reply.code(201).send({
        id: run.id,
        createdAt: run.created_at.toISOString(),
        pause,
        // The pause is copy plus a route to the grounding exercise that already
        // exists. The app renders this; it is not a second crisis screen.
        pauseMessage: pause ? EXPOSURE_PAUSE_MESSAGE : null,
        groundingToolId: pause ? EXPOSURE_PAUSE_GROUNDING_TOOL_ID : null,
      });
    },
  });
}
