import AuthenticatedShell from '@/app/components/AuthenticatedShell';
import SamplingConsole from './_components/SamplingConsole';

export default function SamplingPage() {
  return (
    <AuthenticatedShell>
      <main className="mx-auto flex max-w-5xl flex-col gap-[var(--spacing-lg)] px-[var(--spacing-lg)] py-[var(--spacing-xl)]">
        <div>
          <h1 className="text-[var(--text-display-title)] font-[var(--text-display-title--font-weight)] text-[var(--color-on-surface)]">
            Stochastic Sampling
          </h1>
          <p className="mt-1 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            Run N ≥ 200 independent samples of an agent, classify each against a target metric,
            and gate on the Wilson score confidence interval&apos;s lower bound rather than the
            raw pass rate. Cost is estimated up front and checked against the environment&apos;s
            monthly budget before the run is allowed.
          </p>
        </div>
        <SamplingConsole />
      </main>
    </AuthenticatedShell>
  );
}
