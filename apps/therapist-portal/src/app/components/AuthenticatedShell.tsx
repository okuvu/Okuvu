'use client';

import { signOut } from 'next-auth/react';
import Sidebar from '@/app/clients/[id]/_components/sidebar';

export default function AuthenticatedShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Sidebar />
      <div className="md:ml-[240px] min-h-screen bg-[#F4F6F8]">
        {/* F-03: Sidebar (the only sign-out control) is hidden below md;
            this mobile-only bar keeps sign-out reachable on the dashboard. */}
        <div className="md:hidden flex items-center justify-between h-14 px-4 bg-white border-b border-gray-200">
          <span className="text-sm font-semibold text-[#1A6B5A]">OKUVU</span>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/auth' })}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
