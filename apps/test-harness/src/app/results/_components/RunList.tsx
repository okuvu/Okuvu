'use client';

import { useRef, useState, useTransition } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { TestRun } from '@okuvu/prisma';
import RunStatusBadge from '@/app/components/RunStatusBadge';
import BadgeChip from '@/app/components/BadgeChip';
import { archiveRunAction } from '../actions';

// Only virtualize once the list is long enough that it matters — for small
// lists (the common case) plain mapping is simpler and has no windowing
// overhead or scroll-container quirks.
const VIRTUALIZE_THRESHOLD = 200;
const ROW_HEIGHT_PX = 49;

export default function RunList({
  runs,
  loading,
  selectedForCompare,
  onToggleCompare,
  onArchived,
  detailRunId,
  onSelectDetail,
}: {
  runs: TestRun[];
  loading: boolean;
  selectedForCompare: string[];
  onToggleCompare: (runId: string) => void;
  onArchived: (runId: string) => void;
  detailRunId: string | null;
  onSelectDetail: (runId: string) => void;
}) {
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = runs.length > VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? runs.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 10,
  });

  const handleArchive = (runId: string) => {
    setArchivingId(runId);
    setArchiveError(null);
    startTransition(async () => {
      const result = await archiveRunAction({ runId });
      setArchivingId(null);
      if (result.success) {
        onArchived(runId);
      } else {
        setArchiveError(result.error);
      }
    });
  };

  if (loading) {
    return (
      <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
        Loading runs…
      </p>
    );
  }

  if (runs.length === 0) {
    return (
      <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
        No runs found for this environment.
      </p>
    );
  }

  const renderRow = (run: TestRun) => {
    const isSelectedForCompare = selectedForCompare.includes(run.id);
    const isDetailOpen = detailRunId === run.id;
    return (
      <tr
        key={run.id}
        style={shouldVirtualize ? { height: ROW_HEIGHT_PX } : undefined}
        className={`cursor-pointer border-b border-[var(--color-outline-variant)] last:border-0 hover:bg-[var(--color-surface-container-low)] ${
          isDetailOpen ? 'bg-[var(--color-surface-container-low)]' : ''
        }`}
        onClick={() => onSelectDetail(run.id)}
      >
        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            aria-label={`Select run ${run.id} for compare`}
            checked={isSelectedForCompare}
            onChange={() => onToggleCompare(run.id)}
          />
        </td>
        <td className="px-3 py-2">
          <RunStatusBadge status={run.status} />
        </td>
        <td className="px-3 py-2">
          <BadgeChip>{run.environment}</BadgeChip>
        </td>
        <td className="px-3 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]">
          {run.agent ?? '—'}
        </td>
        <td className="px-3 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
          {new Date(run.created_at).toLocaleString()}
        </td>
        <td className="px-3 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
          {run.archived_at ? new Date(run.archived_at).toLocaleString() : '—'}
        </td>
        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            disabled={Boolean(run.archived_at) || archivingId === run.id}
            onClick={() => handleArchive(run.id)}
            className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-2.5 py-1 text-[var(--text-label-sm)] text-[var(--color-on-surface)] transition-colors hover:bg-[var(--color-surface-container-high)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {run.archived_at ? 'Archived' : archivingId === run.id ? 'Archiving…' : 'Archive'}
          </button>
        </td>
      </tr>
    );
  };

  const virtualItems = shouldVirtualize ? virtualizer.getVirtualItems() : [];
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0 ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <div className="flex flex-col gap-[var(--spacing-sm)]">
      {archiveError ? (
        <p className="text-[var(--text-body-main)] text-[var(--color-error)]">{archiveError}</p>
      ) : null}
      <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
        Select up to two runs to compare. Click a row to expand its trace.
      </p>
      <div
        ref={scrollRef}
        className={`overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] ${
          shouldVirtualize ? 'max-h-[600px] overflow-y-auto' : ''
        }`}
      >
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container-low)]">
              <th className="px-3 py-2 text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface-variant)]">
                Compare
              </th>
              <th className="px-3 py-2 text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface-variant)]">
                Status
              </th>
              <th className="px-3 py-2 text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface-variant)]">
                Environment
              </th>
              <th className="px-3 py-2 text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface-variant)]">
                Agent
              </th>
              <th className="px-3 py-2 text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface-variant)]">
                Created
              </th>
              <th className="px-3 py-2 text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface-variant)]">
                Archived
              </th>
              <th className="px-3 py-2 text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface-variant)]" />
            </tr>
          </thead>
          <tbody>
            {shouldVirtualize ? (
              <>
                {paddingTop > 0 ? <tr style={{ height: paddingTop }} aria-hidden="true" /> : null}
                {virtualItems.map((virtualRow) => renderRow(runs[virtualRow.index]))}
                {paddingBottom > 0 ? <tr style={{ height: paddingBottom }} aria-hidden="true" /> : null}
              </>
            ) : (
              runs.map((run) => renderRow(run))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
