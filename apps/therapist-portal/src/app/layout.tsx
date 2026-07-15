import type { Metadata } from 'next';
import './globals.css';
import { TRPCProvider } from '@/trpc/provider';
import AuthProvider from '@/lib/auth-provider';

export const metadata: Metadata = {
  title: 'Evia — Therapist Portal',
  description: 'Therapist dashboard for Evia',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
      </head>
      <body>
        <TRPCProvider>
          <AuthProvider>{children}</AuthProvider>
        </TRPCProvider>
      </body>
    </html>
  );
}
