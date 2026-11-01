'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { copy } from '@/lib/marketing/copy';
import { LogoLink } from './Logo';
import ThemeToggle from './ThemeToggle';

/**
 * Marketing nav.
 *
 * Translucent stone over the hero, solid with a hairline once the page has
 * scrolled 40 px. The threshold is a scroll listener rather than a
 * ScrollTimeline because Safari support is still uneven, and it runs on
 * `passive` so it never blocks a scroll frame.
 *
 * "Sign in" is an indigo outline pill at every state. Amber is spent on one
 * control only — "Join the waitlist" — so the page has a single visual call to
 * action; a second amber button would split it.
 */
export default function MarketingNav({ signedIn }: { signedIn: boolean }) {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className="mk-nav" data-stuck={stuck ? 'true' : 'false'}>
      <div className="mk-wrap mk-nav-inner">
        {/* Lockup: mark + wordmark, and the brand line directly beneath it, so
            the name and what it means are read in one glance at the top of the
            page. The line sits outside the link, so it never becomes part of
            the link's accessible name. */}
        <div className="mk-brand">
          <LogoLink />
          <span className="mk-brand-tagline">{copy.hero.eyebrowTop}</span>
        </div>
        <nav className="mk-nav-links" aria-label="Sections">
          <a href="#how-it-works">{copy.nav.howItWorks}</a>
          <a href="#who-sees-what">{copy.nav.whoSeesWhat}</a>
          <a href="#for-therapists">{copy.nav.forTherapists}</a>
        </nav>
        <div className="mk-nav-actions">
          <ThemeToggle />
          <Link href={signedIn ? '/dashboard' : '/auth'} className="mk-pill mk-pill--outline">
            {signedIn ? copy.nav.openPortal : copy.nav.signIn}
          </Link>
        </div>
      </div>
    </header>
  );
}
