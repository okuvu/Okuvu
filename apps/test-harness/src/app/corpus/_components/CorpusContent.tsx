'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEnvironment } from '@/lib/environment-context';
import type { CorpusCaseType, TestRunStatus } from '@evia/shared-types';
import type { CorpusCaseWithLineage } from '@/server/routers/corpus';
import {
  listCasesAction,
  createCaseAction,
  exportPairedComparisonAction,
  bulkImportCasesAction,
  runCaseAction,
} from '../actions';
import BadgeChip from '@/app/components/BadgeChip';
import RunStatusBadge from '@/app/components/RunStatusBadge';
import CaseEditor from './CaseEditor';
import NewCaseForm from './NewCaseForm';
import BulkImportForm from './BulkImportForm';
import AdjudicationQueue from './AdjudicationQueue';

const CASE_TYPES: CorpusCaseType[] = ['safety', 'fidelity', 'adversarial', 'persona'];

// Only virtualize once the case list is long enough that it matters — small
// lists render fine with a plain map and don't need windowing overhead.
const VIRTUALIZE_THRESHOLD = 200;
const CASE_ROW_HEIGHT_PX = 84;

// Corpus runs hit the real pipeline (1-2 real LLM calls per case in
// staging/beta) — bounded so selecting a large batch doesn't fire dozens of
// simultaneous model calls at once.
const RUN_CONCURRENCY = 3;

interface CaseRunState {
  status: TestRunStatus;
  judgeRationale?: string | null;
  error?: string;
}

async function runWithConcurrency(
  ids: string[],
  worker: (id: string) => Promise<void>,
  concurrency: number,
): Promise<void> {
  let index = 0;
  const next = async (): Promise<void> => {
    const i = index++;
    if (i >= ids.length) return;
    await worker(ids[i]);
    return next();
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, next));
}

export default function CorpusContent() {
  const { environment } = useEnvironment();
  const [cases, setCases] = useState<CorpusCaseWithLineage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [typeFilter, setTypeFilter] = useState<CorpusCaseType | ''>('');
  const [tagFilter, setTagFilter] = useState('');
  const [includeHistory, setIncludeHistory] = useState(false);

  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [selectedForExport, setSelectedForExport] = useState<Set<string>>(new Set());
  const [showNewCaseForm, setShowNewCaseForm] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showAdjudicationQueue, setShowAdjudicationQueue] = useState(false);
  const [exportCsv, setExportCsv] = useState<string | null>(null);
  const [runResults, setRunResults] = useState<Record<string, CaseRunState>>({});
  const [running, setRunning] = useState(false);

  const refresh = () => {
    const tags = tagFilter
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    startTransition(async () => {
      const result = await listCasesAction({
        type: typeFilter || undefined,
        tags: tags.length > 0 ? tags : undefined,
        environment,
        includeHistory,
      });
      if (result.success) {
        setCases(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  };

  // Refresh whenever filters or environment change.
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [environment, typeFilter, tagFilter, includeHistory]);

  const toggleExportSelection = (id: string) => {
    setSelectedForExport((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = () => {
    if (selectedForExport.size === 0) return;
    startTransition(async () => {
      const result = await exportPairedComparisonAction({
        caseIds: Array.from(selectedForExport),
      });
      if (result.success) {
        setExportCsv(result.data.csv);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  };

  const handleRunSelected = () => {
    if (selectedForExport.size === 0 || running) return;
    const ids = Array.from(selectedForExport);
    setRunning(true);
    setRunResults((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = { status: 'running' };
      return next;
    });

    (async () => {
      await runWithConcurrency(
        ids,
        async (id) => {
          const result = await runCaseAction({ caseId: id, environment });
          setRunResults((prev) => ({
            ...prev,
            [id]: result.success
              ? { status: result.data.status, judgeRationale: result.data.judge?.rationale ?? null }
              : { status: 'error', error: result.error },
          }));
        },
        RUN_CONCURRENCY,
      );
      setRunning(false);
    })();
  };

  const downloadCsv = () => {
    if (!exportCsv) return;
    const blob = new Blob([exportCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'paired-comparison.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedCase = cases.find((c) => c.id === selectedCaseId) ?? null;
  const listRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = cases.length > VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? cases.length : 0,
    getScrollElement: () => listRef.current,
    estimateSize: () => CASE_ROW_HEIGHT_PX,
    overscan: 10,
  });

  const renderCaseItem = (c: CorpusCaseWithLineage) => (
    <li
      key={c.id}
      className={`flex items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] p-[var(--spacing-sm)] ${
        selectedCaseId === c.id ? 'bg-[var(--color-surface-container-low)]' : ''
      }`}
    >
      <input
        type="checkbox"
        aria-label={`Select ${c.id} for export`}
        checked={selectedForExport.has(c.id)}
        onChange={() => toggleExportSelection(c.id)}
        className="mt-1"
      />
      <button type="button" onClick={() => setSelectedCaseId(c.id)} className="flex-1 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <BadgeChip>{c.type}</BadgeChip>
          <BadgeChip>v{c.version}</BadgeChip>
          <BadgeChip>{c.dataOrigin ?? 'synthetic'}</BadgeChip>
          {c.seedId && <BadgeChip>factory variant</BadgeChip>}
          {c.adjudicationRequired && <BadgeChip>needs adjudication</BadgeChip>}
          {c.tags.map((tag) => (
            <BadgeChip key={tag}>{tag}</BadgeChip>
          ))}
          {runResults[c.id] && <RunStatusBadge status={runResults[c.id].status} />}
        </div>
        <p className="mt-1 line-clamp-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]">
          {c.input}
        </p>
        {runResults[c.id]?.judgeRationale && (
          <p className="mt-1 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
            Judge: {runResults[c.id].judgeRationale}
          </p>
        )}
        {runResults[c.id]?.error && (
          <p className="mt-1 text-[var(--text-label-sm)] text-[var(--color-error)]">
            {runResults[c.id].error}
          </p>
        )}
      </button>
    </li>
  );

  return (
    <div className="flex flex-col gap-[var(--spacing-lg)]">
      <div className="flex flex-wrap items-center gap-[var(--spacing-md)]">
        <select
          aria-label="Filter by type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as CorpusCaseType | '')}
          className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-3 py-1.5 text-[var(--text-label-sm)] text-[var(--color-on-surface)]"
        >
          <option value="">All types</option>
          {CASE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        <input
          aria-label="Filter by tags (comma-separated)"
          placeholder="Filter by tags, comma-separated"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-3 py-1.5 text-[var(--text-label-sm)] text-[var(--color-on-surface)]"
        />

        <label className="flex items-center gap-2 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
          <input
            type="checkbox"
            checked={includeHistory}
            onChange={(e) => setIncludeHistory(e.target.checked)}
          />
          Include superseded versions
        </label>

        <button
          type="button"
          onClick={() => setShowNewCaseForm((v) => !v)}
          className="rounded-[var(--radius-lg)] bg-[var(--color-primary)] px-3 py-1.5 text-[var(--text-label-sm)] font-medium text-[var(--color-on-primary)]"
        >
          {showNewCaseForm ? 'Cancel' : '+ New case'}
        </button>

        <button
          type="button"
          onClick={() => setShowBulkImport((v) => !v)}
          className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-3 py-1.5 text-[var(--text-label-sm)] text-[var(--color-on-surface)]"
        >
          {showBulkImport ? 'Cancel import' : 'Import from Excel/CSV'}
        </button>

        <button
          type="button"
          onClick={() => setShowAdjudicationQueue((v) => !v)}
          className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-3 py-1.5 text-[var(--text-label-sm)] text-[var(--color-on-surface)]"
        >
          {showAdjudicationQueue ? 'Hide adjudication queue' : 'Adjudication queue'}
        </button>

        <button
          type="button"
          disabled={selectedForExport.size === 0 || running}
          onClick={handleRunSelected}
          className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-3 py-1.5 text-[var(--text-label-sm)] text-[var(--color-on-surface)] disabled:opacity-50"
        >
          {running ? 'Running…' : `Run selected through pipeline (${selectedForExport.size})`}
        </button>

        <button
          type="button"
          disabled={selectedForExport.size === 0 || isPending}
          onClick={handleExport}
          className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-3 py-1.5 text-[var(--text-label-sm)] text-[var(--color-on-surface)] disabled:opacity-50"
        >
          Export paired comparison ({selectedForExport.size})
        </button>

        {exportCsv && (
          <button
            type="button"
            onClick={downloadCsv}
            className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-3 py-1.5 text-[var(--text-label-sm)] text-[var(--color-on-surface)]"
          >
            Download CSV
          </button>
        )}
      </div>

      {error && (
        <p className="text-[var(--text-body-main)] text-[var(--color-error)]">Error: {error}</p>
      )}

      {showNewCaseForm && (
        <NewCaseForm
          environment={environment}
          onCreated={() => {
            setShowNewCaseForm(false);
            refresh();
          }}
          createCaseAction={createCaseAction}
        />
      )}

      {showBulkImport && (
        <BulkImportForm
          environment={environment}
          onImported={refresh}
          bulkImportCasesAction={bulkImportCasesAction}
        />
      )}

      {showAdjudicationQueue && <AdjudicationQueue onResolved={refresh} />}

      {selectedForExport.size > 0 && (
        <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
          {environment === 'sandbox'
            ? 'Running in sandbox uses simulated replies — judging against expected_output is skipped there. Switch to staging or beta to grade replies.'
            : 'Running hits the real model — each case costs a real LLM call. Results appear as new runs on the Results page.'}
        </p>
      )}

      <div className="grid grid-cols-1 gap-[var(--spacing-lg)] md:grid-cols-2">
        <div className="flex flex-col gap-[var(--spacing-sm)]">
          <h2 className="text-[var(--text-section-header)] font-[var(--text-section-header--font-weight)] text-[var(--color-on-surface)]">
            Cases {isPending && '(loading…)'}
          </h2>
          {shouldVirtualize ? (
            // Windowed rendering can't stay inside a semantic <ul> (the
            // absolutely-positioned wrapper divs aren't valid <li> content),
            // so the virtualized branch renders as an ARIA list instead.
            <div
              ref={listRef}
              role="list"
              className="relative max-h-[720px] overflow-y-auto"
            >
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
                {virtualizer.getVirtualItems().map((virtualRow) => (
                  <div
                    key={virtualRow.key}
                    role="listitem"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                      paddingBottom: 'var(--spacing-xs)',
                    }}
                  >
                    {renderCaseItem(cases[virtualRow.index])}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-[var(--spacing-xs)]">
              {cases.map((c) => renderCaseItem(c))}
              {cases.length === 0 && !isPending && (
                <li className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
                  No cases match the current filters.
                </li>
              )}
            </ul>
          )}
        </div>

        <div>
          {selectedCase ? (
            <CaseEditor
              selectedCase={selectedCase}
              allCases={cases}
              environment={environment}
              onVersioned={refresh}
              onGenerated={refresh}
            />
          ) : (
            <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
              Select a case to view its version history and diff.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
