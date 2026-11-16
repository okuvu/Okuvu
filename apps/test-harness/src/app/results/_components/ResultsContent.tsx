'use client';

import { useEffect, useState, useTransition } from 'react';
import { useEnvironment } from '@/lib/environment-context';
import { listRunsAction, exportRunsXlsxAction } from '../actions';
import type { TestRun } from '@okuvu/prisma';
import DownloadXlsxButton from '@/app/components/DownloadXlsxButton';
import { downloadBase64 } from '@/lib/xlsx-export';
import RunList from './RunList';
import RunDetail from './RunDetail';
import CompareView from './CompareView';

/**
 * TH-S25 results/trace viewer.
 *
 * Design choice: run detail and compare are shown expand-in-place below the
 * table (no `[runId]` sub-route) — this keeps the run-selection state (the
 * "pick 2 runs to compare" checkboxes) trivially shared with the detail
 * view without lifting state across route boundaries, and matches how
 * apps/test-harness's other list pages (corpus, review) are structured as a
 * single client component tree.
 */
export default function ResultsContent() {
  const { environment } = useEnvironment();
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [detailRunId, setDetailRunId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    setExportNote(null);
    const result = await exportRunsXlsxAction({ environment });
    setExporting(false);
    if (!result.success) {
      setExportError(result.error);
      return;
    }
    downloadBase64(result.data.fileName, result.data.base64);
    setExportNote(
      `Saved ${result.data.fileName} — ${result.data.rowCount} runs (${result.data.sheets.summary} summary rows, ${result.data.sheets.turns} turns, ${result.data.sheets.sessions} sessions)${result.data.truncated ? ', truncated at the row limit' : ''}.`,
    );
  };

  const refresh = () => {
    startTransition(async () => {
      const result = await listRunsAction({ environment });
      if (result.success) {
        setRuns(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [environment]);

  const toggleCompareSelection = (runId: string) => {
    setSelectedForCompare((prev) => {
      if (prev.includes(runId)) {
        return prev.filter((id) => id !== runId);
      }
      if (prev.length >= 2) {
        // Only two runs can be compared at once — swap out the oldest pick.
        return [prev[1], runId];
      }
      return [...prev, runId];
    });
  };

  const handleArchived = (runId: string) => {
    setRuns((prev) =>
      prev.map((r) => (r.id === runId ? { ...r, archived_at: new Date() } : r)),
    );
  };

  return (
    <div className="flex flex-col gap-[var(--spacing-lg)]">
      {error ? (
        <p className="text-[var(--text-body-main)] text-[var(--color-error)]">{error}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <DownloadXlsxButton
          onClick={handleExport}
          disabled={runs.length === 0}
          pending={exporting}
          label="Download all runs as .xlsx"
        />
        <span className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
          One row per run, per turn and per session for the selected environment.
        </span>
      </div>
      {exportError ? (
        <p className="text-[var(--text-label-sm)] text-[var(--color-error)]">Export failed: {exportError}</p>
      ) : null}
      {exportNote ? (
        <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">{exportNote}</p>
      ) : null}

      <RunList
        runs={runs}
        loading={isPending && runs.length === 0}
        selectedForCompare={selectedForCompare}
        onToggleCompare={toggleCompareSelection}
        onArchived={handleArchived}
        detailRunId={detailRunId}
        onSelectDetail={(id) => setDetailRunId((prev) => (prev === id ? null : id))}
      />

      {selectedForCompare.length === 2 ? (
        <CompareView runIdA={selectedForCompare[0]} runIdB={selectedForCompare[1]} />
      ) : null}

      {detailRunId ? <RunDetail runId={detailRunId} /> : null}
    </div>
  );
}
