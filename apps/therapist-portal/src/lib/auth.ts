import NextAuth, { type NextAuthOptions } from 'next-auth';
import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import CognitoProvider from 'next-auth/providers/cognito';
import { cognitoPortalConfig } from '@/lib/cognito-config';

// Cognito replaced Google OAuth for therapist sign-in (see
// docs/AWS-CUTOVER-SPEC.md). Google federation inside the pool is off: an
// OAuth client id is a GCP resource, so relying on it would keep a GCP
// dependency alive.
//
// The only provider is the real therapist pool. When its configuration is
// absent there is no provider at all — never a credentials stub — and the
// sign-in page says so instead of offering a button that cannot work.
export function buildProviders(): NextAuthOptions['providers'] {
  const config = cognitoPortalConfig();
  if (!config) {
    return [];
  }
  return [
    CognitoProvider({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      issuer: config.issuer,
    }),
  ];
}

export const authConfig: NextAuthOptions = {
  providers: buildProviders(),
  // F-13: this app handles clinical data, so the default 30-day NextAuth
  // session is too long-lived. 12 hours covers a working day; NextAuth's
  // JWT strategy re-issues the token on activity, so an active therapist
  // isn't interrupted mid-session — an idle session simply expires.
  session: { strategy: 'jwt', maxAge: 12 * 60 * 60 },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === 'cognito' && profile?.email) {
        if (process.env.LOCAL_DEV_BYPASS_AUTH === 'true') {
          return true;
        }
        try {
          const { prisma } = await import('@/lib/prisma');
          if (!prisma) {
            console.error('[AUTH] Database not configured');
            return '/auth?error=server_error';
          }
          const therapist = await prisma.therapist.findUnique({
            where: { email: profile.email },
          });
          if (therapist) {
            console.log(`[AUTH] Successful sign-in: ${profile.email}`);
            return true;
          }
          console.warn('[AUTH] Unauthorized sign-in attempt: ' + profile.email);
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
