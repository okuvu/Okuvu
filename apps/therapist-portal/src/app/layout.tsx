import type { Metadata } from 'next';
import './globals.css';
import { fraunces, manrope, poppinsSemiBold } from './fonts';
import { TRPCProvider } from '@/trpc/provider';
import AuthProvider from '@/lib/auth-provider';

export const metadata: Metadata = {
  title: 'OKUVU — Therapist Portal',
  description: 'Therapist dashboard for OKUVU',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${poppinsSemiBold.variable} ${fraunces.variable} ${manrope.variable}`}>
      <body>
        <TRPCProvider>
          <AuthProvider>{children}</AuthProvider>
        </TRPCProvider>
      </body>
    </html>
  );
}
