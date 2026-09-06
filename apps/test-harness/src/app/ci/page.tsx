import AuthenticatedShell from '@/app/components/AuthenticatedShell';
import CiConsole from './_components/CiConsole';

export default function CiPage() {
  return (
    <AuthenticatedShell>
      <main className="mx-auto flex max-w-5xl flex-col gap-[var(--spacing-lg)] px-[var(--spacing-lg)] py-[var(--spacing-xl)]">
        <div>
          <h1 className="text-[var(--text-display-title)] font-[var(--text-display-title--font-weight)] text-[var(--color-on-surface)]">
            CI Regression Status
          </h1>
          <p className="mt-1 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            Gate status for .github/workflows/regression.yml, sourced live from the GitHub
            Actions REST API. Requires GITHUB_TOKEN/GITHUB_REPO to be configured.
          </p>
        </div>
        <CiConsole />
      </main>
    </AuthenticatedShell>
  );
}
