'use client';

import { useEffect, useState } from 'react';
import RunStatusBadge from '@/app/components/RunStatusBadge';
import TraceViewer from '@/app/components/TraceViewer';
import { getRunAction } from '../actions';

type GetRunData = Awaited<ReturnType<typeof getRunAction>>;

export default function RunDetail({ runId }: { runId: string }) {
  const [data, setData] = useState<GetRunData | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    getRunAction({ runId }).then((result) => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (!data) {
    return (
      <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
        Loading run detail…
      </p>
    );
  }

  if (!data.success) {
    return <p className="text-[var(--text-body-main)] text-[var(--color-error)]">{data.error}</p>;
  }

  const { run, resultRows, trace, signals, samples, rawResults } = data.data;

  return (
    <div className="flex flex-col gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]">
      <div className="flex flex-wrap items-center gap-[var(--spacing-sm)]">
        <h2 className="text-[var(--text-title-sm)] font-[var(--text-title-sm--font-weight)] text-[var(--color-on-surface)]">
          Run {run.id}
        </h2>
        <RunStatusBadge status={run.status} />
      </div>

      {trace ? (
        <TraceViewer data={trace} title={`Per-agent trace (${trace.length} steps)`} defaultExpanded />
      ) : null}

      {signals ? <TraceViewer data={signals} title={`Signal bus (${signals.length} signals)`} /> : null}

      {samples ? <TraceViewer data={samples} title={`Samples (${samples.length})`} /> : null}

      {resultRows.length > 0 ? (
        <TraceViewer data={resultRows} title={`Result rows (${resultRows.length})`} />
      ) : null}

      {/* Always show the raw results blob too — the reconstructed
          trace/signals/samples above are best-effort per whichever router
          wrote this run; nothing here is hidden if it doesn't match a known
          shape. */}
      <TraceViewer data={rawResults} title="Raw results (Json)" />
      <TraceViewer data={run.frozen_triple} title="Frozen triple" />
      <TraceViewer data={run.dependency_graph} title="Dependency graph" />
    </div>
  );
}
