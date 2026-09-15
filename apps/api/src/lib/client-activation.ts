import { prisma } from './prisma.js';

/**
 * Therapist-portal wireframes, Phase 1: TherapistClient's status
 * (Pending/Active/Ended) is derived from timestamps, not stored as an
 * enum. This marks the "Active" transition — the first time this client
 * pulls real data after redeeming their invite — for every therapist
 * relationship that hasn't already been activated. Idempotent: a no-op
 * once activated_at is set.
 */
export async function markClientActivatedIfNeeded(userId: string): Promise<void> {
  await prisma.therapistClient.updateMany({
    where: { client_user_id: userId, activated_at: null },
    data: { activated_at: new Date() },
  });
}
