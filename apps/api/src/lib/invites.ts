import { prisma } from './prisma.js';
import { hashInviteToken } from '../crypto/invite-token-hash.js';

export type RedeemInviteResult =
  | { status: 'ok'; userId: string }
  | { status: 'not_found' }
  | { status: 'already_redeemed' }
  | { status: 'expired' }
  | { status: 'account_already_linked' };

export async function redeemInvite(
  authSubject: string,
  token: string,
): Promise<RedeemInviteResult> {
  const invite = await prisma.inviteToken.findUnique({
    where: { token_hash: hashInviteToken(token) },
    select: { id: true, client_user_id: true, expires_at: true, redeemed_at: true },
  });

  if (!invite) {
    return { status: 'not_found' };
  }

  if (invite.redeemed_at) {
    return { status: 'already_redeemed' };
  }

  if (invite.expires_at < new Date()) {
    return { status: 'expired' };
  }

  const existingForUid = await prisma.user.findUnique({
    where: { auth_subject: authSubject },
    select: { id: true },
  });
  if (existingForUid && existingForUid.id !== invite.client_user_id) {
    return { status: 'account_already_linked' };
  }

  // Array form, not the interactive-callback form used elsewhere (e.g.
  // lib/account.ts) — no cross-statement branching needed here, both writes
  // are unconditional once we've reached this point.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: invite.client_user_id },
      data: { auth_subject: authSubject },
    }),
    prisma.inviteToken.update({
      where: { id: invite.id },
      data: { redeemed_at: new Date() },
    }),
  ]);

  return { status: 'ok', userId: invite.client_user_id };
}
