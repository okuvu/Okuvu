'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';

interface TopBarProps {
  clientLabel?: string;
}

export default function TopBar({ clientLabel }: TopBarProps) {
  const { data: session } = useSession();
  const therapistName = session?.user?.name ?? 'T';

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
      <div className="flex items-center justify-between h-14 px-4 md:px-6 ml-0 md:ml-[240px]">
        <nav aria-label="Breadcrumb" className="flex items-center text-sm">
          <Link href="/dashboard" className="text-gray-500 hover:text-[#1A6B5A] transition-colors text-xs font-medium">
            Dashboard
          </Link>
          {clientLabel && (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300 mx-1.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <span className="text-xs font-medium text-[#1A6B5A]">{clientLabel}</span>
            </>
          )}
        </nav>

        <div className="flex items-center gap-3">
          {/* F-03: the sidebar's sign-out control is hidden below md — this
              is the only sign-out path on mobile/narrow-tablet viewports. */}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/auth' })}
            className="md:hidden flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 overflow-hidden">
            {session?.user?.image ? (
              <img src={session.user.image} alt="" className="w-full h-full object-cover" />
            ) : (
              therapistName.charAt(0).toUpperCase()
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
