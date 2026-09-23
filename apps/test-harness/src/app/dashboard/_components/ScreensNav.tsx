import Link from 'next/link';

/**
 * Simulated-Conversation Runner Spec v1.1 §2 — MVP information architecture:
 * the harness had no navigation (every screen a direct URL — see
 * docs/test-harness/engineer-runbook.md), which is a large part of why 14
 * screens read as bloated. This shared nav prunes the surface to the five
 * MVP screens — nothing is deleted: deferred screens stay in code, reachable
 * by direct URL, and return to the nav post-MVP.
 *
 * MVP core (spec Table 2 — KEEP):
 *   Chat      → /simulator          (R3: short-chat fidelity)
 *   Agent     → /agents             (R1: single-agent isolation)
 *   Pipeline  → /pipeline           (R2: agent-to-agent connection)
 *   Personas  → /conversations      (R4: the Simulated-Conversation Runner)
 *   Results   → /results            (R1–R4: outputs + TH-S38 Excel export)
 *
 * Safety exception (spec §2 note): Fault Injection and the S3/S4-capture
 * check stay available in MVP — "prove the fail-safe actually fires" must
 * be defensible from day one — just not on the main surface.
 *
 * Deferred screens are hidden behind the NEXT_PUBLIC_HARNESS_FULL_NAV=1
 * feature flag (or shown automatically in non-production dev), so they stay
 * discoverable to engineers without re-opening the MVP surface.
 */

const MVP_SCREENS: { href: string; label: string; description: string }[] = [
  { href: '/simulator', label: 'Chat', description: 'Simulator — plain-language chat (short-chat fidelity)' },
  { href: '/agents', label: 'Agent', description: 'Single Agent — A1 / A9-pre / A8 / A2 / A9-post in isolation' },
  { href: '/pipeline', label: 'Pipeline', description: 'Pipeline Runner — the agent-to-agent view' },
  { href: '/conversations', label: 'Personas', description: 'Conversation Driver — scripted + simulated multi-session runs' },
  { href: '/results', label: 'Results', description: 'Results & Traces — runs, compare, bulk .xlsx export' },
];

const DEFERRED_SCREENS: { href: string; label: string; description: string }[] = [
  { href: '/corpus', label: 'Corpus Manager', description: 'Single-line cases + the persona bank' },
  { href: '/review', label: 'Blinded Review', description: 'Rate blinded outputs (human fidelity check)' },
  { href: '/config', label: 'Model Config', description: 'Pin model/prompt versions (reproducibility)' },
  { href: '/review/results', label: 'Review Results', description: "Cohen's κ, PI-only" },
  { href: '/sampling', label: 'Stochastic Sampling', description: 'N-sample runs with Wilson CI (deferred)' },
  { href: '/determinism', label: 'Determinism', description: 'N-run / restart panels (deferred; A8 matrix stays in Pipeline)' },
  { href: '/ci', label: 'CI Regression', description: 'Gate status, HALT failures (deferred)' },
  { href: '/beta', label: 'Beta Status', description: 'S3/S4 capture, retention (deferred)' },
];

// Safety exception: Fault Injection stays reachable in MVP (spec §2) —
// appended after the MVP five, visually separated below.
const SAFETY_SCREENS: { href: string; label: string; description: string }[] = [
  { href: '/faults', label: 'Fault Injection', description: 'Safety: force timeouts/errors, verify fail-safes' },
];

function shouldShowFullNav(): boolean {
  if (process.env.NEXT_PUBLIC_HARNESS_FULL_NAV === '1') return true;
  return process.env.NODE_ENV === 'development';
}

function ScreenLink({ screen }: { screen: { href: string; label: string; description: string } }) {
  return (
    <Link
      key={screen.href}
      href={screen.href}
      className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] p-3 transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-container-low)]"
    >
      <div className="text-[var(--text-body-main)] font-medium text-[var(--color-on-surface)]">{screen.label}</div>
      <div className="mt-0.5 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">{screen.description}</div>
    </Link>
  );
}

export default function ScreensNav() {
  const showFullNav = shouldShowFullNav();

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] uppercase tracking-wide text-[var(--color-on-surface-variant)]">
          Screens
        </h2>
        {!showFullNav ? (
          <span className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
            MVP surface — deferred screens reachable by URL · set NEXT_PUBLIC_HARNESS_FULL_NAV=1 to show all
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {MVP_SCREENS.map((screen) => (
          <ScreenLink key={screen.href} screen={screen} />
        ))}
        {SAFETY_SCREENS.map((screen) => (
          <ScreenLink key={screen.href} screen={screen} />
        ))}
      </div>

      {showFullNav ? (
        <>
          <h3 className="mb-2 mt-4 text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] uppercase tracking-wide text-[var(--color-on-surface-variant)]">
            Deferred (post-MVP)
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {DEFERRED_SCREENS.map((screen) => (
              <ScreenLink key={screen.href} screen={screen} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
