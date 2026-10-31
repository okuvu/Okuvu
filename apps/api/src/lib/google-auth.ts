import { JwtVerificationError, verifyRs256Jwt, type Rs256JwtPayload } from './rs256-jwks.js';

/**
 * Google ID-token verification for the mobile app's sign-in.
 *
 * The Flutter client signs in with `google_sign_in` and posts the resulting ID
 * token to `POST /auth/google`. Nothing else in the app trusts Google: the
 * route verifies the token here, links the account, and issues an Okuvu session
 * token (`session-token.ts`) that the rest of the API actually accepts.
 *
 * The audience is the **web** OAuth client id (`GOOGLE_MOBILE_CLIENT_ID`), not
 * the Android one: an Android OAuth client cannot issue ID tokens, and
 * `google_sign_in` only returns an `idToken` when it is given a server client
 * id. The Android client (package `ai.okuvu.app` + signing-certificate SHA-1)
 * still has to exist for the Play Services consent dialog to accept the app, but
 * it never appears in a token claim.
 *
 * Scope discipline: only an ID token with a verified email is accepted. A
 * Google account without `email_verified` cannot be linked to a client record,
 * because `User.email` is the join key the therapist portal writes and the
 * whole invite model depends on that email being genuinely the client's.
 */

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

/**
 * Google has used both spellings for years and documents both; rejecting
 * `accounts.google.com` would break a share of real tokens for no security gain.
 */
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'] as const;

export class GoogleTokenError extends Error {
  constructor(message: string, readonly reason: string) {
    super(message);
    this.name = 'GoogleTokenError';
  }
}

export interface GoogleIdentity {
  /** Google subject — becomes `User.auth_subject`. Stable across email changes. */
  sub: string;
  email: string;
  name?: string;
}

export function resolveGoogleClientId(): string {
  const clientId = process.env.GOOGLE_MOBILE_CLIENT_ID?.trim();
  if (!clientId) {
    throw new GoogleTokenError(
      'GOOGLE_MOBILE_CLIENT_ID is not set — Google sign-in cannot be verified.',
      'config_missing',
    );
  }
  return clientId;
}

/** True when the deployment can verify Google tokens at all. */
export function isGoogleSignInConfigured(): boolean {
  try {
    resolveGoogleClientId();
    return true;
  } catch {
    return false;
  }
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const clientId = resolveGoogleClientId();

  let payload: Rs256JwtPayload;
  try {
    payload = await verifyRs256Jwt(idToken, {
      jwksUrl: GOOGLE_JWKS_URL,
      issuers: GOOGLE_ISSUERS,
      audiences: [clientId],
    });
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      throw new GoogleTokenError(`Google token rejected: ${err.message}`, err.reason);
    }
    throw err;
  }

  // Google returns boolean true for consumer accounts and the string "true" for
  // some Workspace-hosted tokens; both mean verified.
  const verified = payload.email_verified === true || payload.email_verified === 'true';
  if (!verified) {
    throw new GoogleTokenError('Google account has no verified email address', 'email_unverified');
  }

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (!email) {
    throw new GoogleTokenError('Google token carries no email claim', 'no_email');
  }

  const name = typeof payload.name === 'string' ? payload.name : undefined;

  return { sub: payload.sub as string, email, name };
}
