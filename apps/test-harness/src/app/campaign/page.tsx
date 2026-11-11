import AuthenticatedShell from '@/app/components/AuthenticatedShell';
import CampaignConsole from './_components/CampaignConsole';

export default function CampaignPage() {
  return (
    <AuthenticatedShell>
      <main className="mx-auto flex max-w-6xl flex-col gap-[var(--spacing-lg)] px-[var(--spacing-lg)] py-[var(--spacing-xl)]">
        <div>
          <h1 className="text-[var(--text-display-title)] font-[var(--text-display-title--font-weight)] text-[var(--color-on-surface)]">
            Campaign
          </h1>
          <p className="mt-1 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            Upload personas, run them as simulated clients against the real pipeline, and read one verdict per
            conversation. A conversation is marked PASS, FAIL, UNGRADED or INCOMPLETE — an ungraded one is never
            counted as a pass.
          </p>
          <p className="mt-1 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
            Runs the in-process pipeline (staging/sandbox). It does not test the deployed api.okuvu.in WebSocket —
            that needs the live driver, which does not exist yet.
          </p>
        </div>
        <CampaignConsole />
      </main>
    </AuthenticatedShell>
  );
}
