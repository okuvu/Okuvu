'use client';

import RunStatusBadge from '@/app/components/RunStatusBadge';

/**
 * TH-S16 — v1 simplification: `stochastic.runSampling` is a single
 * synchronous tRPC mutation (no start/poll pattern exists server-side), so
 * this is just a loading indicator shown while that mutation is in flight —
 * not a poller against a background job.
 */
export default function SamplingProgress({ n }: { n: number }) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]">
      <RunStatusBadge status="running" />
      <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
        Running {n} samples… this call is synchronous and will resolve when every sample has been
        classified. Do not navigate away.
      </p>
    </div>
  );
}
