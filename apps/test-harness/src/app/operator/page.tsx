import AuthenticatedShell from '@/app/components/AuthenticatedShell';
import DashboardContent from '../dashboard/_components/DashboardContent';

/**
 * /operator — the detail view behind the front page.
 *
 * Environment status, recent runs, the gate summary, the config-drift banner
 * and the PI gate sign-off. This is what `/dashboard` used to be, kept for the
 * person who runs the harness rather than for the clinician who reads a
 * transcript. It is reachable only by URL or from the small print on `/`, and
 * it deliberately does not look like a landing page: one heading, no tiles.
 */
export default function OperatorPage() {
  return (
    <AuthenticatedShell>
      <main className="mx-auto flex max-w-5xl flex-col gap-[var(--spacing-lg)] px-[var(--spacing-lg)] py-[var(--spacing-xl)]">
        <div>
          <h1 className="text-[var(--text-display-title)] font-[var(--text-display-title--font-weight)] text-[var(--color-on-surface)]">
            Operator detail
          </h1>
          <p className="mt-1 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            Environment status, recent test runs, deferred screens and gate sign-offs. Not part of the
            clinician&rsquo;s flow — run tests from the front page.
          </p>
        </div>
        <DashboardContent />
      </main>
    </AuthenticatedShell>
  );
}
