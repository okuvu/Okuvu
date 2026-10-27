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
        {/* Fonts are served from jsDelivr's @fontsource / material-symbols
            packages rather than Google's font CDN: after the AWS cutover the
            repo carries no Google-hosted dependency, and these are the same
            families (Inter, Fraunces, Material Symbols Outlined) with the
            CSS font-family names globals.css already references, so nothing
            downstream changes. Weights: Inter 400/500/600/700, Fraunces
            500/600 (Simulator headings only — see the note below). */}
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/inter@5/400.css" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/inter@5/500.css" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/inter@5/600.css" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/inter@5/700.css" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/material-symbols@0.14.0/outlined.css"
        />
        {/* Simulator-only display serif (docs/design/EVIA_Mobile_Design.md's
            brand: Fraunces for headlines, Manrope/Inter for everything else)
            — loaded app-wide like the other fonts above, but only referenced
            by Simulator's own heading class, so no other screen changes. */}
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/fraunces@5/500.css" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/fraunces@5/600.css" />
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
