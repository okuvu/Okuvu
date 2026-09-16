import { FastifyInstance } from 'fastify';
import { verifyFirebaseJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

interface VerifyOtpBody {
  phone_number?: string;
}

const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

export async function authRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: VerifyOtpBody }>('/auth/verify-otp', {
    preHandler: [verifyFirebaseJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const { phone_number } = (request.body ?? {}) as VerifyOtpBody;

      const existingUser = await prisma.user.findUnique({
        where: { firebase_uid: uid },
        select: { id: true },
      });

      if (existingUser) {
        if (phone_number) {
          if (!PHONE_REGEX.test(phone_number.trim())) {
            return reply.status(400).send({
              error: {
                code: 'INVALID_PHONE_FORMAT',
                message: 'phone_number must be in E.164 format (e.g. +1234567890)',
              },
            });
          }
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

      // No matching User for this firebase_uid — do NOT auto-provision.
      // Every real User is created by the therapist-portal's Add-Client
      // wizard (admin.createClientWithInvite) as a placeholder, then linked
      // to a firebase_uid by POST /invites/redeem once the client completes
      // Firebase phone-auth with a valid invite token. Verifying a phone
      // number alone was never sufficient authorization to create an
      // account — that bypassed the whole therapist-assignment model.
      return reply.status(404).send({
        error: {
          code: 'NO_ACCOUNT',
          message: 'No OKUVU account found for this phone number. Use your invite code to activate your account.',
        },
      });
    },
  });
}
