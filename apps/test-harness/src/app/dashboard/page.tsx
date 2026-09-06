import AuthenticatedShell from '@/app/components/AuthenticatedShell';
import DashboardContent from './_components/DashboardContent';

export default function DashboardPage() {
  return (
    <AuthenticatedShell>
      <main className="mx-auto flex max-w-5xl flex-col gap-[var(--spacing-lg)] px-[var(--spacing-lg)] py-[var(--spacing-xl)]">
        <div>
          <h1 className="text-[var(--text-display-title)] font-[var(--text-display-title--font-weight)] text-[var(--color-on-surface)]">
            Dashboard
          </h1>
          <p className="mt-1 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            Environment status, recent test runs, and gate sign-offs.
          </p>
        </div>
        <DashboardContent />
      </main>
    </AuthenticatedShell>
  );
}
