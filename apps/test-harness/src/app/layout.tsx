import type { Metadata } from 'next';
import './globals.css';
import { TRPCProvider } from '@/trpc/provider';
import AuthProvider from '@/lib/auth-provider';
import { EnvironmentProvider } from '@/lib/environment-context';
import { getEnv } from '@/lib/env';

export const metadata: Metadata = {
  title: 'OKUVU — Test Harness',
  description: 'Internal test harness for OKUVU pipeline testing',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const env = getEnv();
  const endpoints = {
    sandbox: env.TEST_HARNESS_API_SANDBOX ?? '',
    staging: env.TEST_HARNESS_API_STAGING ?? '',
    beta: env.TEST_HARNESS_API_BETA ?? '',
  };

  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        />
        {/* Simulator-only display serif (docs/design/EVIA_Mobile_Design.md's
            brand: Fraunces for headlines, Manrope/Inter for everything else)
            — loaded app-wide like the other fonts above, but only referenced
            by Simulator's own heading class, so no other screen changes. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap"
        />
      </head>
      <body>
        <TRPCProvider>
          <AuthProvider>
            <EnvironmentProvider endpoints={endpoints}>{children}</EnvironmentProvider>
          </AuthProvider>
        </TRPCProvider>
      </body>
    </html>
  );
}
