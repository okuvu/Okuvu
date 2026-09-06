'use client';

import TraceViewer from '@/app/components/TraceViewer';
import type { AgentTraceEntry } from '@/lib/pipeline-runner';

/**
 * Expandable per-agent panel: input -> output -> latency -> signals, sourced
 * directly from an entry of `pipeline.runFullPipeline`'s returned `trace`
 * array (assembled by lib/pipeline-runner.ts from processTurn's timing +
 * signals — see that file's doc comments for why `input` is often `null`).
 */
export default function AgentTracePanel({ entry }: { entry: AgentTraceEntry }) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[var(--text-label-md)] font-[var(--text-label-md--font-weight)] text-[var(--color-on-surface)]">
          {entry.agentId}
        </span>
        <span className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
          {entry.latencyMs.toFixed(1)}ms · {entry.signals.length} signal
          {entry.signals.length === 1 ? '' : 's'}
        </span>
      </div>

      <TraceViewer data={{ input: entry.input, output: entry.output }} title="Input → Output" />

      {entry.signals.length > 0 ? (
        <TraceViewer data={entry.signals} title="Signals" />
      ) : null}
    </div>
  );
}
