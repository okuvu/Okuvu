import { FastifyInstance } from 'fastify';
import { verifyCognitoJWT } from '../middleware/auth.js';
import { deleteAccount } from '../lib/account.js';

interface DeleteAccountBody {
  confirm?: boolean;
}

export async function accountRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: DeleteAccountBody }>('/account/delete', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const { confirm } = request.body ?? {};

      if (confirm !== true) {
        return reply.status(400).send({
          error: {
            code: 'CONFIRMATION_REQUIRED',
            message: 'You must set confirm to true to delete your account',
          },
        });
      }

      const result = await deleteAccount(uid, request.log);

      switch (result.status) {
        case 'user_not_found':
          return reply.status(401).send({
            error: { code: 'UNAUTHORIZED', message: 'User not found' },
          });
        case 'already_deleted':
          return reply.status(409).send({
            error: {
              code: 'ALREADY_DELETED',
              message: 'This account has already been deleted',
            },
          });
        case 'active_session':
          return reply.status(409).send({
            error: {
              code: 'ACTIVE_SESSION',
              message: 'You have an active session. Please close it before deleting your account.',
            },
          });
        case 'ok':
          return reply.send({ success: true });
      }
    },
  });
}
