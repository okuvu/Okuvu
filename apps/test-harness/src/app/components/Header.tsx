'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import EnvironmentSelector from '@/app/components/EnvironmentSelector';

export default function Header() {
  const { data: session } = useSession();
  const userName = session?.user?.name ?? 'User';
  const userRole = session?.user?.role;

  return (
    <header className="sticky top-0 z-50 flex h-16 w-full items-center justify-between border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-[var(--spacing-lg)] shadow-[var(--shadow-soft)]">
      <Link
        href="/dashboard"
        className="flex items-center gap-3 rounded-[var(--radius-md)] transition-opacity hover:opacity-75"
        title="Back to dashboard"
      >
        <h1 className="text-[var(--text-section-header)] font-[var(--text-section-header--font-weight)] text-[var(--color-primary)]">
          OKUVU
        </h1>
        <span className="h-4 w-px bg-[var(--color-outline-variant)]" aria-hidden="true" />
        <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
          Test Harness
        </p>
      </Link>

      <div className="flex items-center gap-[var(--spacing-md)]">
        <EnvironmentSelector />

        <div className="flex items-center gap-3 pl-2">
          <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[var(--color-secondary-container)] text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-secondary-container)]">
            {session?.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.user.image} alt="" className="h-full w-full object-cover" />
            ) : (
              userName.charAt(0).toUpperCase()
            )}
          </div>
          <div className="hidden flex-col leading-tight sm:flex">
            <span className="text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface)]">
              {userName}
            </span>
            {userRole ? (
              <span className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
                {userRole}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/auth' })}
            className="rounded-[var(--radius-lg)] px-3 py-1.5 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)] transition-colors hover:bg-[var(--color-surface-container-high)] hover:text-[var(--color-on-surface)]"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
