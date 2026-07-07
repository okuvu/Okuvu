import NextAuth, { type NextAuthOptions } from 'next-auth';
import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';

function buildProviders(): NextAuthOptions['providers'] {
  const providers: NextAuthOptions['providers'] = [
    CredentialsProvider({
      id: 'phone',
      name: 'Phone',
      credentials: {
        idToken: { label: 'Firebase ID Token', type: 'text' },
        phone: { label: 'Phone Number', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.idToken || !credentials?.phone) return null;

        try {
          const { getFirebaseAdminAuth } = await import('@/lib/firebase-server');
          const adminAuth = getFirebaseAdminAuth();
          const decoded = await adminAuth.verifyIdToken(credentials.idToken, true);

          if (!decoded.phone_number) {
            console.warn('[AUTH] Token has no phone_number claim');
            return null;
          }
          if (decoded.phone_number !== credentials.phone) {
            console.warn('[AUTH] Token phone_number does not match credential phone');
            return null;
          }

          return {
            id: decoded.uid,
            phone: decoded.phone_number,
            name: 'Therapist',
            email: `therapist-${decoded.phone_number.replace(/\D/g, '').slice(-4)}@evia.phone`,
          };
        } catch (error) {
          console.error('[AUTH] Token verification failed:', error);
          return null;
        }
      },
    }),
  ];

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
