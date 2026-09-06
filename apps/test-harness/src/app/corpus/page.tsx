import AuthenticatedShell from '@/app/components/AuthenticatedShell';
import CorpusContent from './_components/CorpusContent';

export default function CorpusPage() {
  return (
    <AuthenticatedShell>
      <main className="mx-auto flex max-w-5xl flex-col gap-[var(--spacing-lg)] px-[var(--spacing-lg)] py-[var(--spacing-xl)]">
        <div>
          <h1 className="text-[var(--text-display-title)] font-[var(--text-display-title--font-weight)] text-[var(--color-on-surface)]">
            Corpus Manager
          </h1>
          <p className="mt-1 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            Git-style versioned safety, fidelity, adversarial and persona test cases.
          </p>
        </div>
        <CorpusContent />
      </main>
    </AuthenticatedShell>
  );
}
