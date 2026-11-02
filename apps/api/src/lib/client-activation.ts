import { prisma } from './prisma.js';

/**
 * Therapist-portal wireframes, Phase 1: TherapistClient's status is derived
 * from timestamps, not stored as an enum. This marks the "Active" transition —
 * the first time this client pulls real data — for every therapist
 * relationship that hasn't already been activated. Idempotent: a no-op once
 * activated_at is set.
 *
 * Portal P0 added one guard: an account whose client answered "under 18" never
 * activates. clients.ts's deriveClientStatus already ranks `age_blocked` above
 * `active`, so the portal would still read the refusal correctly — but writing
 * `activated_at` at all would make "did this client ever use Okuvu?" true for
 * someone the product refused, and every count built on that column would
 * quietly include them.
 *
 * The cost is one primary-key lookup per call. It is only reached while a
 * client is unactivated, which is at most the first few requests of an account.
 */
export async function markClientActivatedIfNeeded(userId: string): Promise<void> {
  const declined = await prisma.user.findFirst({
    where: { id: userId, age_declined_at: { not: null } },
    select: { id: true },
  });
  if (declined) return;

  await prisma.therapistClient.updateMany({
    where: { client_user_id: userId, activated_at: null },
    data: { activated_at: new Date() },
  });
}
