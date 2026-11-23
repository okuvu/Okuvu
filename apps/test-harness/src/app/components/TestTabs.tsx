'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The harness's main menu.
 *
 * Replaces the six-tile dashboard grid as the way you move between test types:
 * one bar, always in the same place, sitting at the top of every screen it
 * covers. The tiles were the reason the surface read as "six unrelated boxes"
 * — the six things are not equal destinations, they are five kinds of test on
 * one product plus a sixth that does not exist yet.
 *
 * Labels are the plain-language names a clinician or an operator would use,
 * not the internal screen names:
 *   Short-chat fidelity → /simulator   (one conversation, one reply at a time)
 *   Persona testing     → /campaign    (whole personas, multi-turn, verdicts)
 *   Agent testing       → /agents      (one agent in isolation)
 *   Pipeline testing    → /pipeline    (agent-to-agent wiring)
 *   Fault injection     → /faults      (force a failure, prove the fail-safe)
 *
 * Care plan & exercise is shown but disabled: the tab is real, the screen
 * behind it needs the care-plan columns and the pass-through into the runner
 * first (see the plan-injection work). Rendering it as "next" keeps the menu
 * honest — it is a visible placeholder, not a link to an empty room.
 */

const TABS: { href: string; label: string; hint: string; icon: string }[] = [
  {
    href: '/simulator',
    label: 'Short-chat fidelity',
    hint: 'One conversation, read each reply and what happened behind it',
    icon: 'chat_bubble',
  },
  {
    href: '/campaign',
    label: 'Persona testing',
    hint: 'A sheet of clients, multi-turn conversations, one verdict each',
    icon: 'groups',
  },
  {
    href: '/agents',
    label: 'Agent testing',
    hint: 'One agent in isolation, with a mocked session',
    icon: 'smart_toy',
  },
  {
    href: '/pipeline',
    label: 'Pipeline testing',
    hint: 'The agents wired together, A1 → A9 → A2 → A9',
    icon: 'account_tree',
  },
  {
    href: '/faults',
    label: 'Fault injection',
    hint: 'Force a failure and check the fail-safe fires',
    icon: 'report',
  },
];

const PENDING_TAB = {
  label: 'Care plan & exercise',
  hint: 'Is the right care plan and the right exercise being used? — built next',
  icon: 'checklist',
};

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function TestTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Test types"
      className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-1"
    >
      <ul className="flex flex-wrap items-stretch gap-1">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <li key={tab.href} className="min-w-0 flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                title={tab.hint}
                className={[
                  'flex h-full min-w-0 items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 transition-colors',
                  active
                    ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                    : 'text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-low)]',
                ].join(' ')}
              >
                <span className="material-symbols-outlined text-[18px] leading-none" aria-hidden="true">
                  {tab.icon}
                </span>
                <span className="text-[var(--text-label-sm)] font-medium leading-tight">{tab.label}</span>
              </Link>
            </li>
          );
        })}

        <li className="min-w-0 flex-1">
          <span
            title={PENDING_TAB.hint}
            aria-disabled="true"
            className="flex h-full min-w-0 cursor-not-allowed items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-outline-variant)] px-3 py-2 text-[var(--color-on-surface-variant)] opacity-70"
          >
            <span className="material-symbols-outlined text-[18px] leading-none" aria-hidden="true">
              {PENDING_TAB.icon}
            </span>
            <span className="text-[var(--text-label-sm)] leading-tight">{PENDING_TAB.label}</span>
            <span className="ml-auto rounded-full bg-[var(--color-surface-container-high)] px-2 py-0.5 text-[10px] uppercase tracking-wide">
              next
            </span>
          </span>
        </li>
      </ul>
    </nav>
  );
}
