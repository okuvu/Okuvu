import { FastifyInstance } from 'fastify';
import { verifyFirebaseJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { getAgentContextBundle } from '../lib/agent-context.js';
import type { UserConsent, CarePlanId, AssignmentState } from '@evia/shared-types';

interface CarePlanBody {
  care_plan_id: CarePlanId;
  assignment_state: AssignmentState;
  confidence_at_last_eval: number;
  turns_evaluated: number;
}

const VALID_CARE_PLANS: CarePlanId[] = ['CP1', 'CP2', 'CP3'];
const VALID_ASSIGNMENT_STATES: AssignmentState[] = ['provisional', 'confirmed'];

export async function userRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: UserConsent }>('/users/me/consent', {
    preHandler: [verifyFirebaseJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const body = request.body;

      if (body.safety_monitoring !== true) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_CONSENT',
            message: 'safety_monitoring must be true',
          },
        });
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

      await prisma.engagementProfile.upsert({
        where: { user_id: user.id },
        create: {
          user_id: user.id,
          consent_1: body.safety_monitoring,
          consent_2: body.mood_inference,
          consent_3: body.assessment,
          consent_4: body.emergency_contact,
        },
        update: {
          consent_1: body.safety_monitoring,
          consent_2: body.mood_inference,
          consent_3: body.assessment,
          consent_4: body.emergency_contact,
        },
      });

      request.log.info(
        { event: 'consent_updated', user_id: user.id, changes: body },
        'Consent preferences updated',
      );

      reply.send({ success: true });
    },
  });

  app.get('/users/me/context', {
    preHandler: [verifyFirebaseJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const bundle = await getAgentContextBundle(uid);
      return reply.send(bundle);
    },
  });

  app.patch<{ Params: { id: string }; Body: CarePlanBody }>('/users/:id/care-plan', {
    preHandler: [verifyFirebaseJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const { id } = request.params;
      const body = request.body;

      if (!VALID_CARE_PLANS.includes(body.care_plan_id)) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_CARE_PLAN_ID',
            message: 'care_plan_id must be one of CP1, CP2, CP3',
          },
        });
      }

      if (!VALID_ASSIGNMENT_STATES.includes(body.assignment_state)) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_ASSIGNMENT_STATE',
            message: 'assignment_state must be one of provisional, confirmed',
          },
        });
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

      if (user.id !== id) {
        return reply.status(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Cannot update another user\'s care plan',
          },
        });
      }

      const existing = await prisma.clinicalConfig.findUnique({
        where: { user_id: user.id },
        select: { turns_evaluated: true, assignment_state: true },
      });

      if (existing && body.turns_evaluated < existing.turns_evaluated) {
        return reply.status(400).send({
          error: {
            code: 'STALE_TURNS_EVALUATED',
            message: `turns_evaluated (${body.turns_evaluated}) is lower than current stored value (${existing.turns_evaluated})`,
          },
        });
      }

      const result = await prisma.clinicalConfig.upsert({
        where: { user_id: user.id },
        create: {
          user_id: user.id,
          care_plan_id: body.care_plan_id,
          assignment_state: body.assignment_state,
          confidence_at_last_eval: body.confidence_at_last_eval,
          turns_evaluated: body.turns_evaluated,
        },
        update: {
          care_plan_id: body.care_plan_id,
          assignment_state: body.assignment_state,
          confidence_at_last_eval: body.confidence_at_last_eval,
          turns_evaluated: body.turns_evaluated,
        },
      });

      if (existing && existing.assignment_state !== body.assignment_state) {
        request.log.info(
          {
            event: 'assignment_state_transition',
            user_id: user.id,
            from: existing.assignment_state,
            to: body.assignment_state,
          },
          `Assignment state changed from ${existing.assignment_state} to ${body.assignment_state}`,
        );
      }

      reply.send({
        success: true,
        care_plan_id: result.care_plan_id,
        assignment_state: result.assignment_state,
      });
    },
  });
}
