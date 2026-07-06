import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import type { Session } from 'next-auth';
import { prisma } from '@/lib/prisma';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === 'google' && profile?.email) {
        if (!prisma) {
          console.error('[AUTH] Database not configured');
          return '/login?error=server_error';
        }
        try {
          const therapist = await prisma.therapist.findUnique({
            where: { email: profile.email },
          });
          if (therapist) {
            console.log(`[AUTH] Successful sign-in: ${profile.email}`);
            return true;
          }
          console.warn('[AUTH] Unauthorized sign-in attempt: ' + profile.email);
          return '/login?error=unauthorized';
        } catch (error) {
          console.error('[AUTH] DB error during sign-in:', error);
          return '/login?error=server_error';
        }
      }
      return false;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as Session['user'] & { id: string }).id = token.sub;
      }
      return session;
    },
  },
});
