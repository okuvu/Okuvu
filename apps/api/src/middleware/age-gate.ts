import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { isAgeDeclined } from '@okuvu/shared-types';

/**
 * The API half of the client's own 18+ answer.
 *
 * `docs/app-contracts/age-attestation.md` records the rule: the therapist's
 * confirmation when they add a client is an audit record, and the client's own
 * answer is the gate. The app blocks an under-18 before it ever calls these
 * routes — but an app is a client, and the client is the thing being gated. A
 * declined account must be refused by the server, or a reinstall (or a build
 * with the screen removed) walks straight back in.
 *
 * Deliberately passes anything that is not a recorded refusal:
 * - `age_declined_at` set and `age_confirmed_at` cleared → 403 `UNDER_18`.
 * - Both NULL → the client has not been asked yet (every invited row created
 *   before this feature, and any build in the field). Refusing here would lock
 *   out existing users on deploy, so it does not.
 * - `age_confirmed_at` set → through.
 *
 * Run it after `verifyCognitoJWT`, which has already put the subject on
 * `request.user.uid`.
 */
export async function requireAdultAccount(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { uid } = request.user;

  const user = await prisma.user.findUnique({
    where: { auth_subject: uid },
    select: { age_confirmed_at: true, age_declined_at: true },
  });

  if (!user) {
    reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'User not found' },
    });
    return;
  }

  if (isAgeDeclined(user)) {
    reply.status(403).send({
      error: {
        code: 'UNDER_18',
        message: 'Okuvu is for adults 18 and over.',
      },
    });
  }
}
