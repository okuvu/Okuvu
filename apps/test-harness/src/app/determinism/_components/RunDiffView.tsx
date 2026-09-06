'use client';

import TraceViewer from '@/app/components/TraceViewer';

interface RunSide {
  output?: unknown;
  hash: string;
  latencyMs: number;
}

export default function RunDiffView({
  before,
  after,
  changed,
}: {
  before: RunSide;
  after: RunSide;
  changed: boolean;
}) {
  return (
    <div className="flex flex-col gap-[var(--spacing-md)]">
      <div
        className={`flex items-center gap-2 rounded-[var(--radius-md)] border p-3 ${
          changed ? 'border-red-500/40 bg-red-500/15' : 'border-emerald-500/40 bg-emerald-500/15'
        }`}
      >
        <span className="text-[var(--text-label-md)] font-[var(--text-label-md--font-weight)] text-[var(--color-on-surface)]">
          Changed: {changed ? 'yes' : 'no'}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-[var(--spacing-md)] md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
            Before (cold caches) · {before.latencyMs.toFixed(1)}ms ·{' '}
            <span style={{ fontFamily: '"IBM Plex Mono", monospace' }}>{before.hash.slice(0, 12)}</span>
          </p>
          <TraceViewer data={before.output} title="Before" defaultExpanded />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
            After (caches cleared) · {after.latencyMs.toFixed(1)}ms ·{' '}
            <span style={{ fontFamily: '"IBM Plex Mono", monospace' }}>{after.hash.slice(0, 12)}</span>
          </p>
          <TraceViewer data={after.output} title="After" defaultExpanded />
        </div>
      </div>
    </div>
  );
}
