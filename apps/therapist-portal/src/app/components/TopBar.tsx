'use client';

import { useSession, signOut } from 'next-auth/react';

/**
 * OKUVU brand kit (E99) — the portal's first portal-wide chrome bar.
 * Full-width, present on every page including the (unauthenticated)
 * auth screen — pass `showAvatar={false}` there since there's no
 * session yet. Background is the brand kit's own 3-stop gradient
 * (--brand-thread); the real spiral mark (dark variant, for use on
 * dark surfaces per the brand guidelines) replaces the old text-only
 * "OKUVU" wordmark used everywhere before this pass.
 */
export default function TopBar({
  showAvatar = true,
  onMenuClick,
  menuOpen = false,
}: {
  showAvatar?: boolean;
  onMenuClick?: () => void;
  menuOpen?: boolean;
}) {
  const { data: session } = useSession();
  const therapistName = session?.user?.name ?? 'T';

  return (
    <header
      className="sticky top-0 z-50 flex h-16 items-center justify-between px-4 md:px-6"
      style={{ background: 'var(--brand-thread)' }}
    >
      <div className="flex items-center gap-2 md:gap-2.5">
        {onMenuClick && (
          <button
            type="button"
            id="mobile-nav-toggle"
            onClick={onMenuClick}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-drawer"
            className="md:hidden -ml-1 p-1.5 rounded-lg text-lavender-tint hover:bg-white/10 transition-colors"
          >
            {menuOpen ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        )}
        <div className="flex items-center gap-2.5">
          <img src="/brand/okuvu-mark-dark.svg" alt="" width={28} height={28} className="shrink-0" />
          <span
            className="text-lavender-tint text-base"
            style={{ fontFamily: 'var(--font-wordmark)', letterSpacing: '0.1em' }}
          >
            OKUVU
          </span>
        </div>
      </div>

      {showAvatar && (
        <div className="flex items-center gap-3">
          {/* Sidebar owns sign-out on desktop (hidden below md); this is
              the one surviving mobile-only fallback, replacing what used
              to be two independent copies (AuthenticatedShell + the old
              per-client-route top-bar.tsx). */}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/auth' })}
            className="md:hidden flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-lavender-tint hover:bg-white/10 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
          <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-xs font-semibold text-lavender-tint overflow-hidden">
            {session?.user?.image ? (
              <img src={session.user.image} alt="" className="w-full h-full object-cover" />
            ) : (
              therapistName.charAt(0).toUpperCase()
            )}
          </div>
        </div>
      )}
    </header>
  );
}
