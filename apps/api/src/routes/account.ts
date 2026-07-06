import { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { verifyFirebaseJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

interface DeleteAccountBody {
  confirm?: boolean;
}

export async function accountRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: DeleteAccountBody }>('/account/delete', {
    preHandler: [verifyFirebaseJWT],
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

      const user = await prisma.user.findUnique({
        where: { firebase_uid: uid },
        select: { id: true, deleted_at: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      if (user.deleted_at) {
        return reply.status(409).send({
          error: {
            code: 'ALREADY_DELETED',
            message: 'This account has already been deleted',
          },
        });
      }

      const activeSession = await prisma.sessionLog.findFirst({
        where: { user_id: user.id, session_ended_at: null },
        select: { id: true },
      });

      if (activeSession) {
        return reply.status(409).send({
          error: {
            code: 'ACTIVE_SESSION',
            message: 'You have an active session. Please close it before deleting your account.',
          },
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.emergencyContact.delete({ where: { user_id: user.id } });
        await tx.engagementProfile.delete({ where: { user_id: user.id } });
        await tx.sessionLimit.deleteMany({ where: { user_id: user.id } });
        await tx.clinicalConfig.delete({ where: { user_id: user.id } });
        await tx.safetyState.delete({ where: { user_id: user.id } });
        await tx.sessionLog.deleteMany({ where: { user_id: user.id } });
        await tx.user.update({
          where: { id: user.id },
          data: {
            phone_number: '',
            firebase_uid: `deleted-${randomUUID()}`,
            deleted_at: new Date(),
          },
        });
      });

      request.log.info(
        { event: 'account_deleted', user_id: user.id },
        'Account deleted',
      );

      reply.send({ success: true });
    },
  });
}
