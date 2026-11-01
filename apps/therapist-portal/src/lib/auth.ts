import NextAuth, { type NextAuthOptions } from 'next-auth';
import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import CognitoProvider from 'next-auth/providers/cognito';
import GoogleProvider from 'next-auth/providers/google';
import { cognitoPortalConfig } from '@/lib/cognito-config';
import { googlePortalConfig } from '@/lib/google-config';
import { isAdminEmail } from '@/lib/admin-allowlist';
import { identityRef } from '@/lib/log-identity';

// Two providers, both optional, both real.
//
// Cognito was the only provider after the AWS cutover (see
// docs/AWS-CUTOVER-SPEC.md): Google federation inside the pool is off, an
// OAuth client id is a GCP resource, and relying on it would keep a GCP
// dependency alive.
//
// Google is reinstated for the beta launch because of how therapists are
// actually onboarded — an admin types their personal address into /admin, and
// the great majority of those are gmail accounts. Asking each of them to
// accept a Cognito invitation and hold another password is friction that buys
// nothing when the email is already the identity. Google is strictly additive:
// if its pair of env vars is absent, it does not render and Cognito (or
// nothing) is used exactly as before.
//
// There is never a credentials stub. When no provider is configured the
// sign-in page says so instead of offering a button that cannot work.
export function buildProviders(): NextAuthOptions['providers'] {
  const providers: NextAuthOptions['providers'] = [];

  const google = googlePortalConfig();
  if (google) {
    providers.push(
      GoogleProvider({
        clientId: google.clientId,
        clientSecret: google.clientSecret,
        // Therapists sign in with personal addresses, so no `hd` restriction:
        // pinning it to okuvu.in would lock out every caseload clinician who
        // is not on the Workspace tenant. `prompt: select_account` matters on
        // a shared or multi-account browser — silently reusing the last Google
        // session is how the wrong clinician ends up in the wrong caseload.
        authorization: { params: { prompt: 'select_account' } },
      }),
    );
  }

  const cognito = cognitoPortalConfig();
  if (cognito) {
    providers.push(
      CognitoProvider({
        clientId: cognito.clientId,
        clientSecret: cognito.clientSecret,
        issuer: cognito.issuer,
      }),
    );
  }

  return providers;
}

/** Providers whose identity is trusted only as far as the allowlist below. */
const ALLOWLISTED_PROVIDERS = new Set(['cognito', 'google']);

export const authConfig: NextAuthOptions = {
  providers: buildProviders(),
  // F-13: this app handles clinical data, so the default 30-day NextAuth
  // session is too long-lived. 12 hours covers a working day; NextAuth's
  // JWT strategy re-issues the token on activity, so an active therapist
  // isn't interrupted mid-session — an idle session simply expires.
  session: { strategy: 'jwt', maxAge: 12 * 60 * 60 },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider && ALLOWLISTED_PROVIDERS.has(account.provider) && profile?.email) {
        if (process.env.LOCAL_DEV_BYPASS_AUTH === 'true') {
          return true;
        }
        const email = profile.email;

        // The operator account is admitted by the same allowlist that gates
        // /admin, and is deliberately NOT a Therapist row — an admin who also
        // held a caseload could read conversations on the strength of the
        // admin role alone, which is exactly what the admin console is
        // designed to prevent.
        if (isAdminEmail(email)) {
          console.log(`[AUTH] Successful admin sign-in ref=${identityRef('a', email)}`);
          return true;
        }

        try {
          const { prisma } = await import('@/lib/prisma');
          if (!prisma) {
            console.error('[AUTH] Database not configured');
            return '/auth?error=server_error';
          }
          const therapist = await prisma.therapist.findUnique({
            where: { email },
          });
          if (therapist) {
            // E16-S11: log the therapist id reference, never the address.
            // `identityRef` is a truncated HMAC, so the line still says *which*
            // therapist signed in (stable across attempts) without writing
            // personal data to CloudWatch.
            console.log(
              `[AUTH] Successful sign-in therapist=${identityRef('t', therapist.id)}`,
            );
            return true;
          }
          console.warn(
            `[AUTH] Unauthorized sign-in attempt ref=${identityRef('u', email)}`,
          );
          // There is no therapist self-signup, by design: an admin adds the
          // address first. The message the panel shows for this is "your
          // account is not set up yet — ask your administrator", not "sign
          // up".
          return '/auth?error=unauthorized';
        } catch (error) {
          console.error('[AUTH] DB error during sign-in:', error);
          return '/auth?error=server_error';
        }
      }
      return true;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as typeof session.user & { id: string }).id = token.sub;
      }
      return session;
    },
  },
};

const nextAuth = NextAuth(authConfig);

export const handlers = { GET: nextAuth, POST: nextAuth };

export async function auth() {
  // Discovered while manually verifying F-01/F-07 end-to-end: proxy.ts and
  // server/trpc.ts both honor LOCAL_DEV_BYPASS_AUTH, but this helper didn't
  // — so dashboard/page.tsx and admin/page.tsx (both call auth() directly
  // and redirect on no session) still bounced to /auth even with the flag
  // set, defeating its one purpose (local dev without a real Cognito pool).
  // Safe to make consistent: F-01's boot guard already guarantees this
  // flag can never be "true" in NODE_ENV=production.
  if (process.env.LOCAL_DEV_BYPASS_AUTH === 'true') {
    return { user: { id: 'mock', email: 'bypass@okuvu.dev', name: 'Bypass' } };
  }
  return getServerSession(authConfig);
}

export async function signIn(
  _provider?: string,
  _options?: { redirectTo?: string },
) {
  redirect('/auth');
}

export async function signOut() {
  redirect('/auth');
}
