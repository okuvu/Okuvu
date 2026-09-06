import AuthenticatedShell from '@/app/components/AuthenticatedShell';
import SimulatorWorkspace from './_components/SimulatorWorkspace';

export default function SimulatorPage() {
  return (
    <AuthenticatedShell>
      <main className="flex h-[calc(100vh-var(--header-height,64px))] flex-col bg-[var(--color-simulator-surface)] px-[var(--spacing-lg)] py-[var(--spacing-md)]">
        <div className="mb-[var(--spacing-md)]">
          <h1
            className="text-[28px] leading-[34px] tracking-[-0.01em] text-[var(--color-on-surface)]"
            style={{ fontFamily: 'var(--font-heading-serif)', fontWeight: 600 }}
          >
            Simulator
          </h1>
          <p className="mt-1 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            Chat with the agent and see what happened after each reply, in plain language.
          </p>
        </div>
        <SimulatorWorkspace />
      </main>
    </AuthenticatedShell>
  );
}
