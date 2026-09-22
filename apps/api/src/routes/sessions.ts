import { FastifyInstance } from 'fastify';
import { verifyFirebaseJWT } from '../middleware/auth.js';
import { submitSrsScore } from '../lib/sessions.js';

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

      const result = await submitSrsScore(uid, id, srs_score, request.log);

      switch (result.status) {
        case 'user_not_found':
          return reply.status(401).send({
            error: { code: 'UNAUTHORIZED', message: 'User not found' },
          });
        case 'session_not_found':
          return reply.status(404).send({
            error: { code: 'session_not_found' },
          });
        case 'forbidden':
          return reply.status(403).send({
            error: { code: 'forbidden' },
          });
        case 'session_still_active':
          return reply.status(409).send({
            error: {
              code: 'session_still_active',
              message: 'Session must be closed before submitting SRS.',
            },
          });
        case 'ok':
          return reply.send({ success: true });
      }
    },
  });
}
