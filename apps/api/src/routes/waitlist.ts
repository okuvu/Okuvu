import { FastifyInstance } from 'fastify';
import { verifyCognitoJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { sendWaitlistConfirmationEmail } from '../lib/email.js';

interface WaitlistBody {
  email?: string;
  phone_number?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

// S6 (waitlist) — reached when /auth/verify-otp returns NO_ACCOUNT (a
// Cognito-verified phone number with no matching OKUVU User/invite).
// Gated behind verifyCognitoJWT like verify-otp itself: a valid Cognito
// identity alone is enough to reach this, no OKUVU account required.
export async function waitlistRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: WaitlistBody }>('/waitlist', {
    preHandler: [verifyCognitoJWT],
    handler: async (request, reply) => {
      const { email, phone_number } = request.body ?? {};

      if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
        return reply.status(400).send({
          error: { code: 'INVALID_EMAIL', message: 'A valid email is required' },
        });
      }

      if (typeof phone_number === 'string' && phone_number.trim().length > 0 && !PHONE_REGEX.test(phone_number.trim())) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_PHONE_FORMAT',
            message: 'phone_number must be in E.164 format (e.g. +1234567890)',
          },
        });
      }

      await prisma.waitlistEntry.create({
        data: {
          email: email.trim(),
          phone_number: typeof phone_number === 'string' && phone_number.trim().length > 0
            ? phone_number.trim()
            : null,
        },
      });

      // Confirmation email is best-effort — the row above is already
      // saved, so a send failure never fails the capture itself.
      const { sent } = await sendWaitlistConfirmationEmail({ to: email.trim() });

      reply.send({ success: true, confirmation_sent: sent });
    },
  });
}
