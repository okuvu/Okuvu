import { prisma } from './prisma.js';

/**
 * Account resolution for Google sign-in — the successor to
 * `auth-otp.ts`'s phone-linkage, with the same rule it established: an identity
 * provider proving who you are is **not** authorisation to read clinical data.
 * A `User` row must already exist (created by the therapist portal's Add-Client
 * wizard) for sign-in to reach anything past the waitlist.
 *
 * Resolution order:
 *
 * 1. `auth_subject` already equals this Google `sub` → existing user.
 * 2. No match, but a live `User` exists with this email and **no**
 *    `auth_subject` → this is the invited placeholder the wizard created; bind
 *    the Google subject to it. This is the whole onboarding path for an invited
 *    client: they install the app, tap "Continue with Google" with the address
 *    their therapist typed in, and they are in.
 * 3. That email is already bound to a *different* subject → refuse. Silently
 *    rebinding would be an account-takeover primitive: anyone controlling a
 *    Google account that shares an address with an existing Cognito identity
 *    (or with a recycled address) would inherit that caseload. Support fixes
 *    these by hand; there should be very few.
 * 4. Nothing matches → `no_account`, which the app turns into the waitlist.
 *
 * Soft-deleted users are never resurrected by signing in.
 */

export type GoogleAccountResult =
  | { status: 'existing_user'; userId: string; phoneNumber: string; email: string | null }
  | { status: 'linked'; userId: string; phoneNumber: string; email: string | null }
  | { status: 'email_in_use' }
  | { status: 'account_deleted' }
  | { status: 'no_account'; email: string };

export async function resolveGoogleAccount(
  googleSubject: string,
  email: string,
): Promise<GoogleAccountResult> {
  const bySubject = await prisma.user.findUnique({
    where: { auth_subject: googleSubject },
    select: { id: true, phone_number: true, email: true, deleted_at: true },
  });

  if (bySubject) {
    if (bySubject.deleted_at) return { status: 'account_deleted' };
    return {
      status: 'existing_user',
      userId: bySubject.id,
      phoneNumber: bySubject.phone_number,
      email: bySubject.email,
    };
  }

  const byEmail = await prisma.user.findFirst({
    where: {
      email: { equals: email, mode: 'insensitive' },
      deleted_at: null,
    },
    select: { id: true, auth_subject: true, phone_number: true, email: true },
  });

  if (!byEmail) {
    return { status: 'no_account', email };
  }

  if (byEmail.auth_subject !== null) {
    return { status: 'email_in_use' };
  }

  await prisma.user.update({
    where: { id: byEmail.id },
    data: { auth_subject: googleSubject },
  });

  return {
    status: 'linked',
    userId: byEmail.id,
    phoneNumber: byEmail.phone_number,
    email: byEmail.email,
  };
}
