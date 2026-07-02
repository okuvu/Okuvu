import { FastifyInstance } from 'fastify';
import { verifyFirebaseJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

interface SrsBody {
  srs_score: number;
}

export async function sessionRoute(app: FastifyInstance): Promise<void> {
  app.patch<{ Params: { id: string }; Body: SrsBody }>('/sessions/:id/srs', {
    preHandler: [verifyFirebaseJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const { id } = request.params;
      const { srs_score } = request.body;

      if (srs_score == null || !Number.isInteger(srs_score) || srs_score < 1 || srs_score > 4) {
        return reply.status(400).send({
          error: {
            code: 'invalid_srs_score',
            message: 'srs_score must be an integer between 1 and 4',
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

      const session = await prisma.sessionLog.findUnique({
        where: { id },
        select: { user_id: true, session_ended_at: true },
      });

      if (!session) {
        return reply.status(404).send({
          error: { code: 'session_not_found' },
        });
      }

      if (session.user_id !== user.id) {
        return reply.status(403).send({
          error: { code: 'forbidden' },
        });
      }

      if (!session.session_ended_at) {
        return reply.status(409).send({
          error: {
            code: 'session_still_active',
            message: 'Session must be closed before submitting SRS.',
          },
        });
      }

      await prisma.sessionLog.update({
        where: { id },
        data: { session_feedback_score: srs_score },
      });

      request.log.info(
        {
          event: 'srs_submitted',
          session_id: id,
          srs_score,
          submitted_at: new Date().toISOString(),
        },
        'SRS score submitted',
      );

      reply.send({ success: true });
    },
  });
}
