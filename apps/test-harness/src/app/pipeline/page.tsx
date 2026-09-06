import AuthenticatedShell from '@/app/components/AuthenticatedShell';
import PipelineContent from './_components/PipelineContent';

export default function PipelinePage() {
  return (
    <AuthenticatedShell>
      <main className="mx-auto flex max-w-5xl flex-col gap-[var(--spacing-lg)] px-[var(--spacing-lg)] py-[var(--spacing-xl)]">
        <div>
          <h1 className="text-[var(--text-display-title)] font-[var(--text-display-title--font-weight)] text-[var(--color-on-surface)]">
            Pipeline Runner
          </h1>
          <p className="mt-1 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            A1 → A9-pre → A8 → A2 → A9-post → A13 → A15 — toggle agents, enable Mock Mode to run
            one agent in isolation, then run the full pipeline and inspect each agent&apos;s trace.
          </p>
        </div>
        <PipelineContent />
      </main>
    </AuthenticatedShell>
  );
}
