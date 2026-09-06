import AuthenticatedShell from '@/app/components/AuthenticatedShell';
import ResultsContent from './_components/ResultsContent';

export default function ResultsPage() {
  return (
    <AuthenticatedShell>
      <main className="mx-auto flex max-w-6xl flex-col gap-[var(--spacing-lg)] px-[var(--spacing-lg)] py-[var(--spacing-xl)]">
        <div>
          <h1 className="text-[var(--text-display-title)] font-[var(--text-display-title--font-weight)] text-[var(--color-on-surface)]">
            Trace &amp; Results Viewer
          </h1>
          <p className="mt-1 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            Browse TestRun history, drill into a single run&apos;s trace, or compare two runs
            side-by-side. Runs are append-only — archiving only marks a run as no longer active,
            it never edits recorded content.
          </p>
        </div>
        <ResultsContent />
      </main>
    </AuthenticatedShell>
  );
}
