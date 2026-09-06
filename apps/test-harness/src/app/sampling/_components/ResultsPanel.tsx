'use client';

import RunStatusBadge from '@/app/components/RunStatusBadge';

export interface SamplingRunResult {
  runId: string;
  n: number;
  successCount: number;
  wilsonCI: { lower: number; upper: number; pointEstimate: number };
  gatePassed: boolean;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export default function ResultsPanel({ result }: { result: SamplingRunResult }) {
  return (
    <div className="flex flex-col gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]">
      <div className="flex items-center justify-between">
        <h2 className="text-[var(--text-title-sm)] font-[var(--text-title-sm--font-weight)] text-[var(--color-on-surface)]">
          Results
        </h2>
        <RunStatusBadge status={result.gatePassed ? 'pass' : 'halt'} />
      </div>

      <div className="grid grid-cols-1 gap-[var(--spacing-sm)] sm:grid-cols-3">
        <div className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] p-3">
          <span className="text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface-variant)]">
            Successes
          </span>
          <span className="text-[var(--text-title-sm)] font-[var(--text-title-sm--font-weight)] text-[var(--color-on-surface)]">
            {result.successCount} / {result.n}
          </span>
        </div>

        <div className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] p-3">
          <span className="text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface-variant)]">
            Point estimate
          </span>
          <span className="text-[var(--text-title-sm)] font-[var(--text-title-sm--font-weight)] text-[var(--color-on-surface)]">
            {pct(result.wilsonCI.pointEstimate)}
          </span>
        </div>

        <div className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] p-3">
          <span className="text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface-variant)]">
            95% Wilson CI
          </span>
          <span className="text-[var(--text-title-sm)] font-[var(--text-title-sm--font-weight)] text-[var(--color-on-surface)]">
            {pct(result.wilsonCI.lower)} – {pct(result.wilsonCI.upper)}
          </span>
        </div>
      </div>

      <div
        className={`rounded-[var(--radius-md)] border p-3 text-[var(--text-body-main)] ${
          result.gatePassed
            ? 'border-emerald-500/40 bg-emerald-500/15 text-[var(--color-on-surface)]'
            : 'border-red-500/40 bg-red-500/15 text-[var(--color-on-surface)]'
        }`}
      >
        Gate {result.gatePassed ? 'PASSED' : 'FAILED'} — Wilson CI lower bound{' '}
        {result.gatePassed ? 'meets' : 'is below'} the configured threshold.
      </div>

      <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
        Stored as TestRun{' '}
        <span className="font-mono text-[var(--color-on-surface)]">{result.runId}</span> — see
        TH-S25 for the dedicated run-detail viewer.
      </p>
    </div>
  );
}
