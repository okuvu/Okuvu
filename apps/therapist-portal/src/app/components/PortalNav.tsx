'use client';

import { useState } from 'react';
import TopBar from './TopBar';
import Sidebar from '@/app/clients/[id]/_components/sidebar';

// Shared by the two independent chrome-composition sites (AuthenticatedShell
// and clients/[id]/layout.tsx) — owns the mobile drawer's open/closed state
// so TopBar's hamburger toggle and Sidebar's overlay panel stay in sync
// without duplicating the wiring in both places.
export default function PortalNav() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  function closeDrawer() {
    setMobileNavOpen(false);
    // Return focus to the trigger button — without this, closing via
    // Escape/backdrop/nav-link leaves focus nowhere (or on a removed node).
    document.getElementById('mobile-nav-toggle')?.focus();
  }

  return (
    <>
      <TopBar onMenuClick={() => setMobileNavOpen((open) => !open)} menuOpen={mobileNavOpen} />
      <Sidebar mobileOpen={mobileNavOpen} onClose={closeDrawer} />
    </>
  );
}
