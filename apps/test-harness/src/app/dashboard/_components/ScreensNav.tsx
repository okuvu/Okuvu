import Link from 'next/link';

/**
 * There's no persistent in-app navigation menu yet (every screen is
 * reached by direct URL — see docs/test-harness/engineer-runbook.md's
 * "Screens" table). This gives the dashboard at least one discoverable
 * entry point into the rest of the app instead of a dead end.
 */
const SCREENS: { href: string; label: string; description: string }[] = [
  { href: '/simulator', label: 'Simulator', description: 'Chat with the agent in plain language' },
  { href: '/config', label: 'Model Config', description: 'Pin model versions, view prompt hashes' },
  { href: '/agents', label: 'Single Agent', description: 'Invoke A1/A2/A8/A9-pre/A9-post in isolation' },
  { href: '/faults', label: 'Fault Injection', description: 'Force timeouts/errors, verify fail-safes' },
  { href: '/determinism', label: 'Determinism', description: 'N-run, restart, A8 15-cell matrix' },
  { href: '/sampling', label: 'Stochastic Sampling', description: 'N-sample runs with Wilson CI' },
  { href: '/pipeline', label: 'Pipeline Runner', description: 'Visual pipeline with dependency toggles' },
  { href: '/conversations', label: 'Conversation Driver', description: 'Scripted multi-turn persona runs' },
  { href: '/review', label: 'Blinded Review', description: 'Rate blinded outputs' },
  { href: '/review/results', label: 'Review Results', description: "Cohen's κ, PI-only" },
  { href: '/corpus', label: 'Corpus Manager', description: 'Versioned test cases' },
  { href: '/results', label: 'Results & Traces', description: 'Run history, compare, archive' },
  { href: '/ci', label: 'CI Regression', description: 'Gate status, HALT failures' },
  { href: '/beta', label: 'Beta Status', description: 'S3/S4 capture, retention' },
];

export default function ScreensNav() {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]">
      <h2 className="mb-3 text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] uppercase tracking-wide text-[var(--color-on-surface-variant)]">
        Screens
      </h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {SCREENS.map((screen) => (
          <Link
            key={screen.href}
            href={screen.href}
            className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] p-3 transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-container-low)]"
          >
            <div className="text-[var(--text-body-main)] font-medium text-[var(--color-on-surface)]">
              {screen.label}
            </div>
            <div className="mt-0.5 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
              {screen.description}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
