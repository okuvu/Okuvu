import AuthenticatedShell from '@/app/components/AuthenticatedShell';
import FaultConsole from './_components/FaultConsole';

export default function FaultsPage() {
  return (
    <AuthenticatedShell>
      <main className="mx-auto flex max-w-5xl flex-col gap-[var(--spacing-lg)] px-[var(--spacing-lg)] py-[var(--spacing-xl)]">
        <div>
          <h1 className="text-[var(--text-display-title)] font-[var(--text-display-title--font-weight)] text-[var(--color-on-surface)]">
            Fault Injection Console
          </h1>
          <p className="mt-1 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            Force a fault at a pipeline boundary (A1 / A2 / A9-pre / A9-post), run a turn
            through the pipeline with it, and verify the 3 documented fail-safe assertions.
          </p>
        </div>
        <FaultConsole />
      </main>
    </AuthenticatedShell>
  );
}
