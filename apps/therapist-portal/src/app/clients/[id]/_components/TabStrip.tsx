'use client';

import Link from 'next/link';

/**
 * Therapist-portal wireframes — a per-client horizontal tab strip,
 * replacing the old stacked link-cards at the bottom of the Profile page.
 * Orthogonal to the left sidebar (which stays the cross-client picker).
 *
 * Session Prep and Report Card are two separate wireframe tabs, but both
 * are served today by the single combined /report page (same underlying
 * tRPC procedures, already split into two cards there) — kept as one tab
 * here rather than splitting that page's internals apart. Same for Tools:
 * it's a thin hub linking to the existing Homework and Reminders pages
 * rather than a merge of their content.
 */
const TABS = [
  { key: 'profile', label: 'Profile', href: (id: string) => `/clients/${id}` },
  { key: 'conversation', label: 'Conversation', href: (id: string) => `/clients/${id}/conversation` },
  { key: 'report', label: 'Session Prep & Report Card', href: (id: string) => `/clients/${id}/report` },
  { key: 'program', label: 'Care Plan', href: (id: string) => `/clients/${id}/program` },
  { key: 'tools', label: 'Tools', href: (id: string) => `/clients/${id}/tools` },
  { key: 'notes', label: 'Notes', href: (id: string) => `/clients/${id}/notes` },
] as const;

export type TabKey = (typeof TABS)[number]['key'];

export function TabStrip({ clientId, active }: { clientId: string; active: TabKey }) {
  return (
    <div className="border-b border-hairline bg-oat-elevated rounded-t-xl -mb-px">
      <nav className="flex gap-1 px-4" aria-label="Client sections">
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Link
              key={tab.key}
              href={tab.href(clientId)}
              className={`px-3 py-3 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-violet text-royal-purple'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
