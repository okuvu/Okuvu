import { FastifyInstance } from 'fastify';
import { verifyFirebaseJWT } from '../middleware/auth.js';
import { redeemInvite } from '../lib/invites.js';

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
    // Tighter than the app-wide default (app.ts) — this endpoint takes a
    // secret token as input, so it's brute-forceable in a way most other
    // routes aren't. 10/minute per source IP is generous for a real user
    // (one invite, entered by hand or via deep link) but meaningfully
    // slows down guessing.
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const { uid } = request.user;
      const { token } = request.body ?? {};

      if (typeof token !== 'string' || token.trim().length === 0) {
        return reply.status(400).send({
          error: { code: 'INVALID_BODY', message: 'token is required' },
        });
      }

      const result = await redeemInvite(uid, token);

      switch (result.status) {
        case 'not_found':
          return reply.status(404).send({
            error: { code: 'NOT_FOUND', message: 'Invite not found' },
          });
        case 'already_redeemed':
          return reply.status(409).send({
            error: { code: 'ALREADY_REDEEMED', message: 'This invite has already been used' },
          });
        case 'expired':
          return reply.status(410).send({
            error: { code: 'EXPIRED', message: 'This invite has expired' },
          });
        case 'account_already_linked':
          return reply.status(409).send({
            error: {
              code: 'ACCOUNT_ALREADY_LINKED',
              message: 'This device is already signed in as a different OKUVU account',
            },
          });
        case 'ok':
          return reply.send({ success: true, user_id: result.userId });
      }
    },
  });
}
