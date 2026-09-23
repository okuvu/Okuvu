import NextAuth, { type NextAuthOptions, type Session } from 'next-auth';
import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import GoogleProvider from 'next-auth/providers/google';
import type { HarnessRole, TestEnvironment } from '@okuvu/shared-types';

function buildProviders(): NextAuthOptions['providers'] {
  const providers: NextAuthOptions['providers'] = [];

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      }),
    );
  }

  return providers;
}

export const authConfig: NextAuthOptions = {
  providers: buildProviders(),
  session: { strategy: 'jwt' },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === 'google' && profile?.email) {
        try {
          const { prisma } = await import('@/lib/prisma');
          if (!prisma) {
            console.error('[AUTH] Database not configured');
            return '/auth?error=server_error';
          }
          const access = await prisma.testHarnessAccess.findUnique({
            where: { email: profile.email },
          });
          if (access) {
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
    async jwt({ token, account, profile }) {
      if (account && profile?.email) {
        try {
          const { prisma } = await import('@/lib/prisma');
          if (prisma) {
            const access = await prisma.testHarnessAccess.findUnique({
              where: { email: profile.email },
            });
            if (access) {
              token.role = access.role as HarnessRole;
              token.environments = access.environments as TestEnvironment[];
            }
          }
        } catch (error) {
          console.error('[AUTH] DB error during jwt callback:', error);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        if (token.role) {
          session.user.role = token.role;
        }
        if (token.environments) {
          session.user.environments = token.environments;
        }
      }
      return session;
    },
  },
};

const nextAuth = NextAuth(authConfig);

export const handlers = { GET: nextAuth, POST: nextAuth };

export async function auth() {
  // Local-dev bypass (mirror of LOCAL_DEV_BYPASS_AUTH in apps/api + apps/worker):
  // HARD_HARNESS_LOCAL_DEV_BYPASS_AUTH=true issues a synthetic PI session so the
  // harness is usable without Google OAuth (e.g. redirect_uri not registered).
  // Guardrails: production refuses to boot with it set (below); every bypassed
  // request is loudly logged; and the synthetic session is scoped to sandbox
  // environments only — real OAuth remains the only path to staging/beta.
  if (process.env.HARD_HARNESS_LOCAL_DEV_BYPASS_AUTH === 'true') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'FATAL: HARD_HARNESS_LOCAL_DEV_BYPASS_AUTH is set in NODE_ENV=production — refusing to serve.',
      );
    }
    if (!(globalThis as { __harnessBypassWarned?: boolean }).__harnessBypassWarned) {
      console.warn(
        '[AUTH] LOCAL DEV BYPASS ACTIVE — synthetic PI session (sandbox-only). NEVER set in any deployed environment.',
      );
      (globalThis as { __harnessBypassWarned?: boolean }).__harnessBypassWarned = true;
    }
    return {
      user: {
        id: 'local-dev-bypass',
        email: 'local-dev-bypass@okuvu.in',
        name: 'Local Dev (bypass)',
        role: 'PI' as const,
        environments: ['sandbox'] as TestEnvironment[],
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    } satisfies Session;
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
