'use client';

import type { PerTurnTrace } from '@/lib/trace-export';
import { getPlainLanguageRows, getRowColorClass, type SignalRowStatus } from '@/lib/plain-language-signals';
import RunStatusBadge from '@/app/components/RunStatusBadge';
import TraceViewer from '@/app/components/TraceViewer';
import type { PipelineSignal, TestRunStatus } from '@evia/shared-types';
import PanelHeader from './PanelHeader';

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined leading-none ${className}`} aria-hidden="true">
      {name}
    </span>
  );
}

const ROW_ICON: Record<SignalRowStatus, string> = {
  ok: 'check_circle',
  warning: 'warning',
  blocked: 'block',
};

export default function FlowStatusPane({ latestTurn }: { latestTurn: PerTurnTrace | null }) {
  if (!latestTurn) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)] shadow-[var(--shadow-soft)]">
        <PanelHeader icon="fact_check">What happened</PanelHeader>
        <p className="mt-3 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
          Send a message to see the flow status here.
        </p>
      </div>
    );
  }

  const signals = latestTurn.signals as PipelineSignal[];
  const rows = getPlainLanguageRows(signals, latestTurn.resultType);
  const overallStatus: TestRunStatus =
    latestTurn.resultType === 'crisis' ? 'halt' : latestTurn.resultType === 'error' ? 'error' : 'pass';

  return (
    <div className="flex flex-col gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)] shadow-[var(--shadow-soft)]">
      <div>
        <PanelHeader icon="fact_check">What happened</PanelHeader>
        <div className="mt-2">
          <RunStatusBadge status={overallStatus} />
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.label}
            className={`flex items-start gap-2 rounded-[var(--radius-md)] border px-3 py-2 ${getRowColorClass(row.status)}`}
          >
            <Icon name={ROW_ICON[row.status]} className="text-[18px]" />
            <div>
              <p className="text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)]">{row.label}</p>
              <p className="text-[var(--text-body-main)]">{row.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      <details className="group">
        <summary className="cursor-pointer text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]">
          View technical detail
        </summary>
        <div className="mt-2">
          <TraceViewer data={latestTurn} title="Turn trace" defaultExpanded />
        </div>
      </details>
    </div>
  );
}
