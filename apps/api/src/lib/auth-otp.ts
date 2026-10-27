import { prisma } from './prisma.js';

const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

export type VerifyOtpResult =
  | { status: 'existing_user'; userId: string }
  | { status: 'invalid_phone_format' }
  | { status: 'no_account' };

export async function verifyOtpAndLinkPhone(
  authSubject: string,
  phoneNumber?: string,
): Promise<VerifyOtpResult> {
  const existingUser = await prisma.user.findUnique({
    where: { auth_subject: authSubject },
    select: { id: true },
  });

  if (existingUser) {
    if (phoneNumber) {
      if (!PHONE_REGEX.test(phoneNumber.trim())) {
        return { status: 'invalid_phone_format' };
      }
      await prisma.user.update({
        where: { auth_subject: authSubject },
        data: { phone_number: phoneNumber },
      });
    }
    return { status: 'existing_user', userId: existingUser.id };
  }

  // No matching User for this auth_subject — do NOT auto-provision. Every
  // real User is created by the therapist-portal's Add-Client wizard
  // (admin.createClientWithInvite) as a placeholder, then linked to a
  // auth_subject by POST /invites/redeem once the client completes Cognito
  // phone-OTP sign-in with a valid invite token. Verifying a phone number alone was
  // never sufficient authorization to create an account — that bypassed the
  // whole therapist-assignment model.
  return { status: 'no_account' };
}
