import type { Metadata } from 'next';
import './globals.css';
import { TRPCProvider } from '@/trpc/provider';
import AuthProvider from '@/lib/auth-provider';

export const metadata: Metadata = {
  title: 'OKUVU — Therapist Portal',
  description: 'Therapist dashboard for OKUVU',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TRPCProvider>
          <AuthProvider>{children}</AuthProvider>
        </TRPCProvider>
      </body>
    </html>
  );
}
