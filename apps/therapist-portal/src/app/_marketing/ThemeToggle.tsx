'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { copy } from '@/lib/marketing/copy';

/**
 * Light / dark / system switch for the marketing page.
 *
 * Before this existed the theme was decided only by `prefers-color-scheme`, so
 * a visitor whose device runs dark had no way to see the light page — the site
 * looked broken rather than themed. The switch sets `data-theme` on <html>,
 * which is what marketing.css now keys its dark blocks on; "system" removes the
 * attribute and hands control back to the operating system.
 *
 * The attribute is written before paint by an inline script in page.tsx, so a
 * returning visitor never sees the wrong theme flash first. This component only
 * mirrors that state for the button's own label.
 */
type Choice = 'system' | 'light' | 'dark';

const KEY = 'okuvu-theme';
/** Click order: back to the device, then the two fixed choices. */
const ORDER: Choice[] = ['system', 'light', 'dark'];

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

function apply(choice: Choice) {
  const root = document.documentElement;
  try {
    if (choice === 'system') {
      delete root.dataset.theme;
      localStorage.removeItem(KEY);
    } else {
      root.dataset.theme = choice;
      localStorage.setItem(KEY, choice);
    }
  } catch {
    // Private mode or a blocked storage API: the theme still applies for this
    // page view, it just will not be remembered. Never fail the click on it.
    if (choice !== 'system') root.dataset.theme = choice;
    else delete root.dataset.theme;
  }
}

export default function ThemeToggle() {
  // Rendered as "system" on the server; the stored choice is read on mount so
  // the server HTML and the first client render agree and nothing mismatches.
  const [choice, setChoice] = useState<Choice>('system');

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(KEY);
    } catch {
      stored = null;
    }
    if (stored === 'light' || stored === 'dark') setChoice(stored);
  }, []);

  const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
  const Icon = ICONS[choice];

  return (
    <button
      type="button"
      className="mk-theme"
      data-choice={choice}
      onClick={() => {
        apply(next);
        setChoice(next);
      }}
      aria-label={copy.nav.theme[choice]}
      title={copy.nav.theme[choice]}
    >
      <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}
