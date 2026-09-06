import AuthenticatedShell from '@/app/components/AuthenticatedShell';
import DeterminismContent from './_components/DeterminismContent';

export default function DeterminismPage() {
  return (
    <AuthenticatedShell>
      <main className="mx-auto flex max-w-5xl flex-col gap-[var(--spacing-lg)] px-[var(--spacing-lg)] py-[var(--spacing-xl)]">
        <div>
          <h1 className="text-[var(--text-display-title)] font-[var(--text-display-title--font-weight)] text-[var(--color-on-surface)]">
            Determinism Harness
          </h1>
          <p className="mt-1 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            A8 router state-space coverage, N-run hash comparison, and restart-survival checks —
            all against the real production agent adapters.
          </p>
        </div>
        <DeterminismContent />
      </main>
    </AuthenticatedShell>
  );
}
