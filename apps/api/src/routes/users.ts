import { FastifyInstance } from 'fastify';
import { verifyFirebaseJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

interface ConsentBody {
  safety_monitoring: boolean;
  mood_inference: boolean;
  assessment: boolean;
  emergency_contact: boolean;
}

export async function userRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: ConsentBody }>('/users/me/consent', {
    preHandler: [verifyFirebaseJWT],
    handler: async (request, reply) => {
      const { uid } = (request as any).user;
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
}
