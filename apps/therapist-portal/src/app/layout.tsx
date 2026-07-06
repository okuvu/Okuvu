import type { Metadata } from 'next';
import './globals.css';
import { TRPCProvider } from '@/trpc/provider';

export const metadata: Metadata = {
  title: 'Evia — Therapist Portal',
  description: 'Therapist dashboard for Evia',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
