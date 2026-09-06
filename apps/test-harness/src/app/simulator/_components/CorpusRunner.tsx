'use client';

import { useEffect, useState } from 'react';
import type { TestEnvironment, TestRunStatus } from '@evia/shared-types';
import type { CorpusCaseWithLineage } from '@/server/routers/corpus';
import { listCasesAction, bulkImportCasesAction, runCaseAction } from '@/app/corpus/actions';
import BadgeChip from '@/app/components/BadgeChip';
import RunStatusBadge from '@/app/components/RunStatusBadge';
import BulkImportForm from '@/app/corpus/_components/BulkImportForm';
import BreathingPulse from './BreathingPulse';
import PanelHeader from './PanelHeader';

// Same bound used on the Corpus page's own "Run selected" action — each case
// costs a real LLM call in staging/beta, so a large selection shouldn't
// fire dozens of simultaneous model calls.
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

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined leading-none ${className}`} aria-hidden="true">
      {name}
    </span>
  );
}

export default function CorpusRunner({ environment }: { environment: TestEnvironment }) {
  const [cases, setCases] = useState<CorpusCaseWithLineage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [runResults, setRunResults] = useState<Record<string, CaseRunState>>({});
  const [running, setRunning] = useState(false);

  const refresh = async () => {
    const result = await listCasesAction({ environment });
    if (result.success) {
      setCases(result.data);
      setError(null);
    } else {
      setError(result.error);
    }
  };

  useEffect(() => {
    refresh();
    setSelected(new Set());
    setRunResults({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [environment]);

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRunSelected = () => {
    if (selected.size === 0 || running) return;
    const ids = Array.from(selected);
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

  return (
    <div className="flex flex-col gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)] shadow-[var(--shadow-soft)]">
      <PanelHeader
        icon="dataset"
        action={
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowImport((v) => !v)}
              className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-low)] px-3 py-1.5 text-[var(--text-label-sm)] text-[var(--color-on-surface)] transition-colors hover:bg-[var(--color-surface-container-high)]"
            >
              <Icon name="upload_file" className="text-[16px]" />
              {showImport ? 'Cancel import' : 'Import from Excel/CSV'}
            </button>
            <button
              type="button"
              onClick={handleRunSelected}
              disabled={selected.size === 0 || running}
              className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-low)] px-3 py-1.5 text-[var(--text-label-sm)] text-[var(--color-on-surface)] transition-colors hover:bg-[var(--color-surface-container-high)] disabled:opacity-50"
            >
              {running ? <BreathingPulse size={10} /> : <Icon name="play_arrow" className="text-[16px]" />}
              {running ? 'Running…' : `Run selected (${selected.size})`}
            </button>
          </span>
        }
      >
        Corpus cases
      </PanelHeader>

      {error && (
        <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-error)]/30 bg-[var(--color-error-container)] px-3 py-2 text-[var(--text-body-main)] text-[var(--color-on-error-container)]">
          <Icon name="error" className="text-[18px]" />
          <span>{error}</span>
        </div>
      )}

      {showImport && (
        <BulkImportForm
          environment={environment}
          onImported={refresh}
          bulkImportCasesAction={bulkImportCasesAction}
        />
      )}

      {selected.size > 0 && (
        <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
          {environment === 'sandbox'
            ? 'Running in sandbox uses simulated replies — judging against expected_output is skipped there.'
            : 'Running hits the real model — each case costs a real LLM call.'}
        </p>
      )}

      {cases.length === 0 ? (
        <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
          No corpus cases yet — import a spreadsheet or add cases on the Corpus page.
        </p>
      ) : (
        <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {cases.map((c) => {
            const run = runResults[c.id];
            return (
              <li
                key={c.id}
                className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] p-[var(--spacing-sm)]"
              >
                <input
                  type="checkbox"
                  aria-label={`Select ${c.id} to run`}
                  checked={selected.has(c.id)}
                  onChange={() => toggleSelected(c.id)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <BadgeChip>{c.type}</BadgeChip>
                    <BadgeChip>{c.dataOrigin ?? 'synthetic'}</BadgeChip>
                    {c.tags.map((tag) => (
                      <BadgeChip key={tag}>{tag}</BadgeChip>
                    ))}
                    {run && <RunStatusBadge status={run.status} />}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]">
                    {c.input}
                  </p>
                  {run?.judgeRationale && (
                    <p className="mt-1 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
                      Judge: {run.judgeRationale}
                    </p>
                  )}
                  {run?.error && (
                    <p className="mt-1 text-[var(--text-label-sm)] text-[var(--color-error)]">{run.error}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
