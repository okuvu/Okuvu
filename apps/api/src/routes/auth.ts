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

      const user = await prisma.user.upsert({
        where: { firebase_uid: uid },
        create: {
          firebase_uid: uid,
          phone_number: phone_number ?? '+0000000000',
        },
        update: phone_number ? { phone_number } : {},
      });

      reply.send({
        user_id: user.id,
        is_new_user: !existingUser,
      });
    },
  });
}
