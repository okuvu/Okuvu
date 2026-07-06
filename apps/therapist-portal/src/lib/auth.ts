import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import type { Session } from 'next-auth';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as Session['user'] & { id: string }).id = token.sub;
      }
      return session;
    },
  },
});
