import { isCognitoConfigured } from './cognito-config';

/**
 * Google sign-in configuration for the therapist portal.
 *
 * Therapists are added by an admin using their *personal* address (usually a
 * gmail.com one), so a Google account is the identity they already have.
 * Cognito remains supported and is preferred when configured — the beta runs
 * both, and whichever pair of environment variables is present decides which
 * buttons `/auth` renders.
 *
 * Deliberately no default, no hardcoded client and no fallback: a missing
 * pair means the button is not rendered at all, rather than rendered and
 * broken. Same rule as `cognito-config.ts`.
 *
 * The client id/secret come from Google Cloud Console → APIs & Services →
 * Credentials → OAuth client ID (Web application), with the authorised
 * redirect URI `<origin>/api/auth/callback/google`. That is a GCP resource,
 * which is why docs/AWS-CUTOVER-SPEC.md removed Google the first time; the
 * beta reinstates it knowingly, because "log in with the address we already
 * registered you under" beats issuing passwords to therapists.
 */
export type GooglePortalConfig = {
  clientId: string;
  clientSecret: string;
};

export function googlePortalConfig(): GooglePortalConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return null;
  }
  return { clientId, clientSecret };
}

export function isGoogleConfigured(): boolean {
  return googlePortalConfig() !== null;
}

/**
 * True when at least one provider can actually complete a sign-in. The auth
 * page uses this instead of the Cognito-only check it used before, so the
 * page stops claiming "no identity provider is configured" on a deployment
 * that has Google and no Cognito.
 */
export function isAnyProviderConfigured(): boolean {
  return isGoogleConfigured() || isCognitoConfigured();
}
