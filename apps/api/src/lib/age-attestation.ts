/**
 * The client's own 18+ attestation — the second of the two, and the one that
 * decides whether the account activates.
 *
 * The therapist attests when they add a client (TherapistClient.
 * age_confirmed_by_therapist_at, captured with their id). That is an audit
 * record, not a gate: the therapist is vouching for someone they know, and the
 * product's 18+ rule is the client's own statement in the app.
 *
 * A decline is therefore not an error the app can argue with. It stamps
 * `age_declined_at`, leaves the account inactive for good (clients.ts derives
 * "Couldn't activate: age" above `active`, so a later activation write cannot
 * overwrite it), and tells the therapist — who otherwise sees a client who
 * never signs in and has no way to know why.
 *
 * The therapist email carries the label, the time and a link. Nothing clinical,
 * because there is nothing clinical to say: the person said they are under 18.
 */

import { prisma } from './prisma.js';
import { sendAgeDeclinedEmail } from './email.js';
import { identityRef } from './log-identity.js';

export type AgeAttestationResult =
  | { status: 'confirmed'; confirmedAt: Date }
  | { status: 'declined'; declinedAt: Date }
  | { status: 'user_not_found' };

export async function recordAgeAttestation(
  authSubject: string,
  adult: boolean,
): Promise<AgeAttestationResult> {
  const user = await prisma.user.findUnique({
    where: { auth_subject: authSubject },
    select: { id: true, age_confirmed_at: true, age_declined_at: true, deleted_at: true },
  });

  if (!user || user.deleted_at) {
    return { status: 'user_not_found' };
  }

  if (adult) {
    // First answer wins for the timestamp, but confirming after a decline is
    // allowed to clear the refusal: a mistap is not a permanent ban, and the
    // client is the person who knows.
    const confirmedAt = user.age_confirmed_at ?? new Date();
    await prisma.user.update({
      where: { id: user.id },
      data: { age_confirmed_at: confirmedAt, age_declined_at: null },
    });
    return { status: 'confirmed', confirmedAt };
  }

  const declinedAt = user.age_declined_at ?? new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      age_declined_at: declinedAt,
      // A refusal is final for this account. Clearing the confirmation is what
      // makes the refusal legible to the portal rather than a tie.
      age_confirmed_at: null,
    },
  });

  void notifyTherapistsOfAgeDecline(user.id, declinedAt);

  return { status: 'declined', declinedAt };
}

/**
 * Tell each active therapist this client did not activate. Never throws: the
 * client's refusal is recorded either way, and an email failure is a log line,
 * not a reason to fail their request.
 */
async function notifyTherapistsOfAgeDecline(userId: string, declinedAt: Date): Promise<void> {
  try {
    const assignments = await prisma.therapistClient.findMany({
      where: { client_user_id: userId, ended_at: null },
      select: { client_label: true, therapist: { select: { email: true, name: true } } },
    });

    const portalBase = (process.env.THERAPIST_PORTAL_URL || 'https://okuvu.in').replace(/\/+$/, '');
    const link = `${portalBase}/clients/${userId}`;

    for (const assignment of assignments) {
      const to = assignment.therapist?.email;
      if (!to) continue;
      try {
        await sendAgeDeclinedEmail({
          to,
          therapistName: assignment.therapist?.name ?? null,
          clientLabel: assignment.client_label,
          declinedAt,
          link,
        });
      } catch (err) {
        console.error('[age-attestation] decline email not sent', {
          clientRef: identityRef('c', userId),
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    console.error('[age-attestation] decline lookup failed', {
      clientRef: identityRef('c', userId),
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
