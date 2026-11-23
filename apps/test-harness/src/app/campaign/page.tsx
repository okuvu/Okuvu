import AuthenticatedShell from '@/app/components/AuthenticatedShell';
import TestTabs from '@/app/components/TestTabs';
import PersonaRunConsole from './_components/PersonaRunConsole';

/**
 * Persona testing — one screen, no modes.
 *
 * This page used to hold two nearly identical consoles behind a "Clinical run
 * / Advanced campaign" switch. They were the same runner with different
 * settings exposed, so the switch asked the operator to make a decision that
 * changed nothing except which subset of knobs they could see. Now the screen
 * is upload → run → read, with the settings collapsed behind one disclosure.
 */
export default function CampaignPage() {
  return (
    <AuthenticatedShell>
      <main className="mx-auto flex max-w-6xl flex-col gap-[var(--spacing-lg)] px-[var(--spacing-lg)] py-[var(--spacing-xl)]">
        <TestTabs />
        <div>
          <h1 className="text-[var(--text-display-title)] font-[var(--text-display-title--font-weight)] text-[var(--color-on-surface)]">
            Persona testing
          </h1>
          <p className="mt-1 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            Simulated clients hold multi-turn conversations with Okuvu. A conversation is marked PASS, FAIL,
            UNGRADED or INCOMPLETE — an ungraded one is never counted as a pass.
          </p>
          <p className="mt-1 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
            Runs the in-process pipeline (staging/sandbox). It does not test the deployed api.okuvu.in
            WebSocket — that needs the live driver, which does not exist yet.
          </p>
        </div>
        <PersonaRunConsole />
      </main>
    </AuthenticatedShell>
  );
}
