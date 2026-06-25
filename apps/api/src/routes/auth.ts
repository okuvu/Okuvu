import { FastifyInstance } from 'fastify';
import { verifyFirebaseJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

interface VerifyOtpBody {
  phone_number?: string;
}

export async function authRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: VerifyOtpBody }>('/auth/verify-otp', {
    preHandler: [verifyFirebaseJWT],
    handler: async (request, reply) => {
      const { uid } = (request as any).user;
      const { phone_number } = (request.body ?? {}) as VerifyOtpBody;

      const existingUser = await prisma.user.findUnique({
        where: { firebase_uid: uid },
        select: { id: true },
      });

      if (existingUser) {
        if (phone_number) {
          await prisma.user.update({
            where: { firebase_uid: uid },
            data: { phone_number },
          });
        }
        return reply.send({
          user_id: existingUser.id,
          is_new_user: false,
        });
      }

      const user = await prisma.user.create({
        data: {
          firebase_uid: uid,
          phone_number: phone_number ?? '+0000000000',
        },
      });

      reply.send({
        user_id: user.id,
        is_new_user: true,
      });
    },
  });
}
