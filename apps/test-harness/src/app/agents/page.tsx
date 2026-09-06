import AuthenticatedShell from '@/app/components/AuthenticatedShell';
import AgentRunner from './_components/AgentRunner';

export default function AgentsPage() {
  return (
    <AuthenticatedShell>
      <main className="mx-auto flex max-w-5xl flex-col gap-[var(--spacing-lg)] px-[var(--spacing-lg)] py-[var(--spacing-xl)]">
        <div>
          <h1 className="text-[var(--text-display-title)] font-[var(--text-display-title--font-weight)] text-[var(--color-on-surface)]">
            Single Agent Invocation
          </h1>
          <p className="mt-1 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            Invoke A1, A2, A8, A9-pre, A9-post, A13, or A15 in isolation with a
            mocked session context. A13 and A15 both trigger the same combined
            apps/worker summary + memory task — see the note in their result.
          </p>
        </div>
        <AgentRunner />
      </main>
    </AuthenticatedShell>
  );
}
