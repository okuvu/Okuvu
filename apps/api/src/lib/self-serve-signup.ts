import { prisma } from './prisma.js';

/**
 * Self-serve account creation — the counterpart to `resolveGoogleAccount`.
 *
 * The old rule was that a `User` row could only be created by the therapist
 * portal's Add-Client wizard, so a verified Google identity with no row reached
 * the waitlist and nothing else. That rule is now split in two instead of
 * dropped: **verifying an identity still creates nothing** (`POST /auth/google`
 * is unchanged), and a separate, explicit, consent-bearing call
 * (`POST /auth/signup`) creates the row. Sign-in proves who you are; this
 * function is the one place that decides an account may exist, and it cannot
 * run without the client's own 18+ answer and consent.
 *
 * What a self-serve row deliberately does NOT have:
 * - `therapist_client` / `therapistClient` — nobody is assigned yet. An
 *   unassigned client sees the whole app, and the agent runs with
 *   `care_plan_focus: null` (no care plan, so the conversation is not
 *   directioned toward CP1/CP2/CP3).
 * - `clinical_config` — the care plan is the therapist's to set at assignment.
 * - `client_code` — the number is derived from legal name + birth year + gender,
 *   and a self-serve signup supplies none of them. The operator console's "Set
 *   ID details" action numbers them once a therapist has them on file.
 *
 * Resolution order mirrors `resolveGoogleAccount` so the two paths can never
 * disagree on what an email means:
 *
 * 1. this Google `sub` already has a row → already registered, nothing written;
 * 2. same email, live row, `auth_subject` NULL → this is an invited row the
 *    portal created; bind the subject and keep the row (its therapist link is
 *    the whole point of the invite);
 * 3. same email bound to a different subject → refuse (`EMAIL_IN_USE`); never
 *    rebind, or whoever controls that address inherits the caseload;
 * 4. soft-deleted row → refuse; signing in never resurrects an account;
 * 5. nothing matches and the client is an adult → create the row + consents;
 * 6. nothing matches and the client is under 18 → create nothing.
 */

export interface SelfServeConsents {
  /** Mandatory — Okuvu's safety monitoring is not optional (consent_1). */
  safety_monitoring: boolean;
  /** Optional: chat summaries visible to a therapist (consent_2). */
  mood_inference: boolean;
  /** Optional: derived assessments visible to a therapist (consent_3). */
  assessment: boolean;
  /** Never asked at signup — owned by the emergency-contact screen (consent_4). */
  emergency_contact: boolean;
}

export type SelfServeSignupResult =
  | { status: 'created'; userId: string; email: string }
  | { status: 'linked'; userId: string; email: string }
  | { status: 'already_registered'; userId: string; email: string | null }
  | { status: 'email_in_use' }
  | { status: 'account_deleted' }
  | { status: 'age_declined' };

function consentColumns(consents: SelfServeConsents) {
  return {
    consent_1: consents.safety_monitoring,
    consent_2: consents.mood_inference,
    consent_3: consents.assessment,
    consent_4: consents.emergency_contact,
  };
}

export async function createSelfServeAccount(
  googleSubject: string,
  email: string,
  adult: boolean,
  consents: SelfServeConsents,
): Promise<SelfServeSignupResult> {
  const normalisedEmail = email.trim().toLowerCase();

  const bySubject = await prisma.user.findUnique({
    where: { auth_subject: googleSubject },
    select: { id: true, email: true, deleted_at: true },
  });

  if (bySubject) {
    if (bySubject.deleted_at) return { status: 'account_deleted' };
    return { status: 'already_registered', userId: bySubject.id, email: bySubject.email };
  }

  const byEmail = await prisma.user.findFirst({
    where: {
      email: { equals: normalisedEmail, mode: 'insensitive' },
      deleted_at: null,
    },
    select: { id: true, auth_subject: true },
  });

  if (byEmail && byEmail.auth_subject !== null) {
    return { status: 'email_in_use' };
  }

  if (!adult) {
    // A refusal is recorded only where there is already a row to record it
    // against — an invited client whose therapist is waiting on them. Their
    // console row then reads "Couldn't activate: age" instead of "not signed in
    // yet", and `auth_subject` stays NULL so the refusal is not a sign-in.
    // For a stranger there is no row to write: nothing is created at all.
    if (byEmail) {
      await prisma.user.update({
        where: { id: byEmail.id },
        data: { age_declined_at: new Date(), age_confirmed_at: null },
      });
    }
    return { status: 'age_declined' };
  }

  const confirmedAt = new Date();

  if (byEmail) {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: byEmail.id },
        data: {
          auth_subject: googleSubject,
          email: normalisedEmail,
          age_confirmed_at: confirmedAt,
          age_declined_at: null,
        },
      });
      await tx.engagementProfile.upsert({
        where: { user_id: byEmail.id },
        create: { user_id: byEmail.id, ...consentColumns(consents) },
        update: consentColumns(consents),
      });
    });
    return { status: 'linked', userId: byEmail.id, email: normalisedEmail };
  }

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        auth_subject: googleSubject,
        email: normalisedEmail,
        age_confirmed_at: confirmedAt,
      },
      select: { id: true },
    });
    await tx.engagementProfile.create({
      data: { user_id: user.id, ...consentColumns(consents) },
    });
    return user;
  });

  return { status: 'created', userId: created.id, email: normalisedEmail };
}
