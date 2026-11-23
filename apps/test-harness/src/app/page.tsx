import Link from 'next/link';
import AuthenticatedShell from '@/app/components/AuthenticatedShell';

/**
 * testing.okuvu.in — the landing page.
 *
 * Two destinations, because there are two things a reviewer does here: run a
 * test (Chat) and read what came out of one (Results). Everything else — the
 * five test types, the corpus, the prompt registry, the gate sign-offs — is
 * either reached from inside Chat or is operator detail, and is not worth a
 * tile on the front door.
 *
 * The detailed operator dashboard (environment status, recent runs, gate
 * summary, sign-off) still exists at /dashboard, unlinked from here. It is a
 * URL for whoever runs the harness, not the front page a clinician lands on.
 */

const TILES: {
  href: string;
  label: string;
  icon: string;
  summary: string;
  points: string[];
}[] = [
  {
    href: '/simulator',
    label: 'Chat',
    icon: 'chat_bubble',
    summary: 'Run a test against Okuvu and read the conversation.',
    points: [
      'Short-chat fidelity — one conversation, reply by reply',
      'Persona testing — a sheet of clients, one verdict each',
      'Agent, pipeline and fault injection testing',
    ],
  },
  {
    href: '/results',
    label: 'Results',
    icon: 'assessment',
    summary: 'Read what a run produced, and compare it with another run.',
    points: [
      'Every recorded run, newest first',
      'One run in detail — the trace, turn by turn',
      'Two runs side by side, or a bulk .xlsx export',
    ],
  },
];

export default function HomePage() {
  return (
    <AuthenticatedShell>
      <main className="mx-auto flex max-w-5xl flex-col gap-[var(--spacing-xl)] px-[var(--spacing-lg)] py-[var(--spacing-xl)]">
        <div>
          <h1 className="text-[var(--text-display-title)] font-[var(--text-display-title--font-weight)] text-[var(--color-on-surface)]">
            Okuvu test harness
          </h1>
          <p className="mt-1 max-w-2xl text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            Test the conversation, then read the result. Pick one.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-[var(--spacing-lg)] md:grid-cols-2">
          {TILES.map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              className="group flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-lg)] shadow-[var(--shadow-soft)] transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-container-low)]"
            >
              <div className="flex items-center gap-2">
                <span
                  className="material-symbols-outlined text-[22px] leading-none text-[var(--color-primary)]"
                  aria-hidden="true"
                >
                  {tile.icon}
                </span>
                <span className="text-[var(--text-section-header)] font-[var(--text-section-header--font-weight)] text-[var(--color-on-surface)]">
                  {tile.label}
                </span>
                <span
                  className="material-symbols-outlined ml-auto text-[18px] leading-none text-[var(--color-on-surface-variant)] transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                >
                  arrow_forward
                </span>
              </div>

              <p className="text-[var(--text-body-main)] text-[var(--color-on-surface)]">{tile.summary}</p>

              <ul className="mt-1 flex flex-col gap-1 border-t border-[var(--color-outline-variant)] pt-3">
                {tile.points.map((point) => (
                  <li
                    key={point}
                    className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]"
                  >
                    {point}
                  </li>
                ))}
              </ul>
            </Link>
          ))}
        </div>

        <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
          Operator detail — environment status, recent runs and gate sign-offs — is at{' '}
          <Link href="/operator" className="underline">
            /operator
          </Link>
          . Deferred screens are reachable by URL and are listed there. Any older bookmark to
          /dashboard now lands here.
        </p>
      </main>
    </AuthenticatedShell>
  );
}
