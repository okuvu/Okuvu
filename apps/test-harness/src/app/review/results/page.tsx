import AuthenticatedShell from '@/app/components/AuthenticatedShell';
import KappaResults from '../_components/KappaResults';

export default function ReviewResultsPage() {
  return (
    <AuthenticatedShell>
      <main className="mx-auto flex max-w-5xl flex-col gap-[var(--spacing-lg)] px-[var(--spacing-lg)] py-[var(--spacing-xl)]">
        <div>
          <h1 className="text-[var(--text-display-title)] font-[var(--text-display-title--font-weight)] text-[var(--color-on-surface)]">
            Review Results
          </h1>
          <p className="mt-1 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            Inter-rater agreement (Cohen&apos;s &kappa;) across blinded review ratings. PI-only.
          </p>
        </div>
        <KappaResults />
      </main>
    </AuthenticatedShell>
  );
}
