import AuthenticatedShell from '@/app/components/AuthenticatedShell';
import ConversationRunner from './_components/ConversationRunner';

export default function ConversationsPage() {
  return (
    <AuthenticatedShell>
      <main className="mx-auto flex max-w-5xl flex-col gap-[var(--spacing-lg)] px-[var(--spacing-lg)] py-[var(--spacing-xl)]">
        <div>
          <h1 className="text-[var(--text-display-title)] font-[var(--text-display-title--font-weight)] text-[var(--color-on-surface)]">
            Persona Conversation Driver
          </h1>
          <p className="mt-1 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            Play a built-in persona script turn-by-turn against one persistent
            synthetic session, review the per-turn trace, and export it for
            clinician review.
          </p>
        </div>
        <ConversationRunner />
      </main>
    </AuthenticatedShell>
  );
}
