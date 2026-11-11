import AuthenticatedShell from '@/app/components/AuthenticatedShell';
import TestingConsole from './_components/TestingConsole';

/**
 * testing.okuvu.in — the chat-quality landing page.
 *
 * Deliberately one screen: upload a persona sheet, run it, and see which
 * transcripts were emailed. The rest of the harness (pipeline traces, corpus,
 * campaign grading) lives behind its own routes and is not linked from here,
 * because the reviewer using this page is not an operator.
 */
export default function TestingPage() {
  return (
    <AuthenticatedShell>
      <main className="mx-auto flex max-w-4xl flex-col gap-[var(--spacing-lg)] px-[var(--spacing-lg)] py-[var(--spacing-xl)]">
        <div>
          <h1 className="text-[var(--text-display-title)] font-[var(--text-display-title--font-weight)] text-[var(--color-on-surface)]">
            Chat quality test
          </h1>
          <p className="mt-1 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            Upload client personas, let each one hold a real conversation with Okuvu, and read the transcripts
            that arrive by email. The judgement is the reviewer&rsquo;s — this page does not score the
            conversations.
          </p>
        </div>
        <TestingConsole />
      </main>
    </AuthenticatedShell>
  );
}
