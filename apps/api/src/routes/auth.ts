import { FastifyInstance } from 'fastify';
import { verifyFirebaseJWT } from '../middleware/auth.js';
import { verifyOtpAndLinkPhone } from '../lib/auth-otp.js';

interface VerifyOtpBody {
  phone_number?: string;
}

export async function authRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: VerifyOtpBody }>('/auth/verify-otp', {
    preHandler: [verifyFirebaseJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const { phone_number } = (request.body ?? {}) as VerifyOtpBody;

      const result = await verifyOtpAndLinkPhone(uid, phone_number);

      switch (result.status) {
        case 'invalid_phone_format':
          return reply.status(400).send({
            error: {
              code: 'INVALID_PHONE_FORMAT',
              message: 'phone_number must be in E.164 format (e.g. +1234567890)',
            },
          });
        case 'no_account':
          return reply.status(404).send({
            error: {
              code: 'NO_ACCOUNT',
              message: 'No OKUVU account found for this phone number. Use your invite code to activate your account.',
            },
          });
        case 'existing_user':
          return reply.send({
            user_id: result.userId,
            is_new_user: false,
          });
      }
    },
  });
}
