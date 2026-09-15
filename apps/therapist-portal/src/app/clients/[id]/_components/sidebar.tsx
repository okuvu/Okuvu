'use client';

import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { trpc } from '@/trpc/client';
import { maskPhone } from '@/lib/format';

const patientsIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const disabledItems = [
  {
    label: 'Schedule',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    label: 'Safety Reviews',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const therapistName = session?.user?.name ?? 'Therapist';
  const isOnClientPage = pathname.startsWith('/clients/');
  const [isPatientsOpen, setIsPatientsOpen] = useState(true);

  const clientsQuery = trpc.clients.list.useQuery(undefined, {
    enabled: isOnClientPage,
  });
  const clients = clientsQuery.data ?? [];

  // F-07: only rendered for the env-configured admin allowlist.
  const { data: adminStatus } = trpc.admin.amIAdmin.useQuery();

  return (
    <nav className="hidden md:flex flex-col fixed left-0 top-0 h-screen w-[240px] bg-white border-r border-gray-200 z-50 py-5">
      <div className="px-6 pb-4 mb-3 border-b border-gray-100">
        <h1 className="text-lg font-semibold text-[#1A6B5A]">OKUVU</h1>
        <p className="text-xs text-gray-500 mt-0.5">Therapist Portal</p>
      </div>

      <div className="flex-1 flex flex-col gap-0.5 px-3 overflow-y-auto">
        <Link
          href="/dashboard"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            pathname === '/dashboard'
              ? 'bg-[#1A6B5A] text-white'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          }`}
        >
          <span className={pathname === '/dashboard' ? 'text-white' : 'text-gray-400'}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
          </span>
          Dashboard
        </Link>

        {isOnClientPage && (
          <div className="relative">
            <svg
              className="absolute left-3 top-0 w-4 text-gray-300 pointer-events-none"
              viewBox="0 0 16 26"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M1 0v22c0 2 0 3 2 3h13" />
            </svg>

            <button
              onClick={() => setIsPatientsOpen(!isPatientsOpen)}
              className="flex items-center gap-3 w-full pl-9 pr-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 tracking-wide uppercase hover:text-gray-600 transition-colors"
            >
              <span className="text-gray-300 shrink-0">{patientsIcon}</span>
              <span className="flex-1 text-left">Patients</span>
              <svg
                className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${
                  isPatientsOpen ? 'rotate-0' : '-rotate-90'
                }`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {isPatientsOpen && (
              <div className="mt-0.5 space-y-0.5 pb-1">
                {clientsQuery.isLoading ? (
                  <div className="pl-10 pr-3 py-1.5 text-xs text-gray-400 italic">
                    Loading...
                  </div>
                ) : clients.length === 0 ? (
                  <div className="pl-10 pr-3 py-1.5 text-xs text-gray-400 italic">
                    No clients assigned
                  </div>
                ) : (
                  clients.map((client) => {
                    const isActive = pathname === `/clients/${client.id}`;
                    return (
                      <Link
                        key={client.id}
                        href={`/clients/${client.id}`}
                        className={`flex items-center gap-3 pl-10 pr-3 py-1.5 rounded-lg text-sm transition-colors ${
                          isActive
                            ? 'text-[#1A6B5A] font-medium bg-[#1A6B5A]/5'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {maskPhone(client.phoneNumber)}
                      </Link>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {adminStatus?.isAdmin && (
          <Link
            href="/admin"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              pathname === '/admin'
                ? 'bg-[#1A6B5A] text-white'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <span className={pathname === '/admin' ? 'text-white' : 'text-gray-400'}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </span>
            Admin
          </Link>
        )}

        {/* wireframes: per-client navigation (Profile/Session Prep &
            Report Card/Tools/Notes) now lives in TabStrip, rendered inside
            each client page — this sidebar stays the cross-client picker +
            global links only, per the plan. */}
        <div className="mt-0">
          {disabledItems.map((item) => (
            <div
              key={item.label}
              role="link"
              aria-disabled="true"
              title="Coming soon"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 cursor-not-allowed"
            >
              <span className="text-gray-300">{item.icon}</span>
              {item.label}
              <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-gray-300">
                Soon
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-auto border-t border-gray-100 pt-3 px-3 flex flex-col gap-0.5">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600">
          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600 overflow-hidden">
            {session?.user?.image ? (
              <img src={session.user.image} alt="" className="w-full h-full object-cover" />
            ) : (
              therapistName.charAt(0).toUpperCase()
            )}
          </div>
          {therapistName}
        </div>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/auth' })}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors w-full text-left"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Sign out
        </button>
      </div>
    </nav>
  );
}
