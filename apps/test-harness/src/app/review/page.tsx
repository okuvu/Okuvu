import AuthenticatedShell from '@/app/components/AuthenticatedShell';
import ReviewQueue from './_components/ReviewQueue';

export default function ReviewPage() {
  return (
    <AuthenticatedShell>
      <main className="mx-auto flex max-w-5xl flex-col gap-[var(--spacing-lg)] px-[var(--spacing-lg)] py-[var(--spacing-xl)]">
        <div>
          <h1 className="text-[var(--text-display-title)] font-[var(--text-display-title--font-weight)] text-[var(--color-on-surface)]">
            Blinded Review
          </h1>
          <p className="mt-1 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            Rate one blinded output at a time. Item order is randomized per-rater by the server —
            your identity comes from your session, not a name you enter here.
          </p>
        </div>
        <ReviewQueue />
      </main>
    </AuthenticatedShell>
  );
}
