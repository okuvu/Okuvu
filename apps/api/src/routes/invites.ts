import { FastifyInstance } from 'fastify';
import { verifyFirebaseJWT } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

interface RedeemInviteBody {
  token?: string;
}

// Therapist-portal wireframes C-06 — the client-side half of the
// Add-Client wizard's provisioning flow. Runs AFTER the mobile app's own
// Firebase phone-auth has already completed (this route is behind
// verifyFirebaseJWT like every other authenticated route — there's no
// separate OTP-dispatch logic here, Firebase already owns that), so
// request.user.uid is the real, just-verified firebase uid to link onto
// the placeholder User row the portal created at wizard-submit time.
export async function invitesRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: RedeemInviteBody }>('/invites/redeem', {
    preHandler: [verifyFirebaseJWT],
    handler: async (request, reply) => {
      const { uid } = request.user;
      const { token } = request.body ?? {};

      if (typeof token !== 'string' || token.trim().length === 0) {
        return reply.status(400).send({
          error: { code: 'INVALID_BODY', message: 'token is required' },
        });
      }

      const invite = await prisma.inviteToken.findUnique({
        where: { token },
        select: { id: true, client_user_id: true, expires_at: true, redeemed_at: true },
      });

      if (!invite) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Invite not found' },
        });
      }

      if (invite.redeemed_at) {
        return reply.status(409).send({
          error: { code: 'ALREADY_REDEEMED', message: 'This invite has already been used' },
        });
      }

      if (invite.expires_at < new Date()) {
        return reply.status(410).send({
          error: { code: 'EXPIRED', message: 'This invite has expired' },
        });
      }

      const existingForUid = await prisma.user.findUnique({
        where: { firebase_uid: uid },
        select: { id: true },
      });
      if (existingForUid && existingForUid.id !== invite.client_user_id) {
        return reply.status(409).send({
          error: {
            code: 'ACCOUNT_ALREADY_LINKED',
            message: 'This device is already signed in as a different OKUVU account',
          },
        });
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id: invite.client_user_id },
          data: { firebase_uid: uid },
        }),
        prisma.inviteToken.update({
          where: { id: invite.id },
          data: { redeemed_at: new Date() },
        }),
      ]);

      reply.send({ success: true, user_id: invite.client_user_id });
    },
  });
}
