'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  {
    label: 'Dashboard',
    href: '/',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
    ),
    disabled: false,
  },
  {
    label: 'Patients',
    href: '/',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    disabled: false,
  },
  {
    label: 'Schedule',
    href: '#',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    disabled: true,
  },
  {
    label: 'Safety Reviews',
    href: '#',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    disabled: true,
  },
  {
    label: 'Reports',
    href: '#',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
    disabled: true,
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const therapistName = session?.user?.name ?? 'Therapist';
  const isPatientsActive = pathname.startsWith('/clients');

  return (
    <nav className="hidden md:flex flex-col fixed left-0 top-0 h-screen w-[240px] bg-white border-r border-gray-200 z-50 py-5">
      <div className="px-6 pb-4 mb-3 border-b border-gray-100">
        <h1 className="text-lg font-semibold text-[#1A6B5A]">Evia</h1>
        <p className="text-xs text-gray-500 mt-0.5">Therapist Portal</p>
      </div>

      <div className="flex-1 flex flex-col gap-0.5 px-3 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = item.label === 'Patients' ? isPatientsActive : pathname === item.href;

          if (item.disabled) {
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 cursor-not-allowed"
              >
                <span className="text-gray-300">{item.icon}</span>
                {item.label}
              </div>
            );
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[#1A6B5A] text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <span className={isActive ? 'text-white' : 'text-gray-400'}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
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
