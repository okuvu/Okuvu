'use client';

import { useState, useTransition } from 'react';
import { useEnvironment } from '@/lib/environment-context';
import TraceViewer from '@/app/components/TraceViewer';
import SrsSessionCloseModal from '@/app/components/SrsSessionCloseModal';
import PersonaPicker, { type PersonaId } from './PersonaPicker';
import TurnStepper from './TurnStepper';
import {
  runPersonaScriptAction,
  exportTraceAction,
  type ActionResult,
} from '../actions';
import type { PerTurnTrace } from '@/lib/trace-export';

type RunState = {
  runId: string;
  personaId: PersonaId;
  turns: PerTurnTrace[];
  endedInCrisis: boolean;
  uid: string;
  sessionId: string;
} | null;

type SessionCloseSummary = {
  summaryTriggered: boolean;
  srsScore: number | null;
} | null;

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ConversationRunner() {
  const { environment } = useEnvironment();
  const [personaId, setPersonaId] = useState<PersonaId>('anxious');
  const [run, setRun] = useState<RunState>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isExporting, startExportTransition] = useTransition();
  const [showSrsModal, setShowSrsModal] = useState(false);
  const [closeSummary, setCloseSummary] = useState<SessionCloseSummary>(null);

  const handleRun = () => {
    setError(null);
    startTransition(async () => {
      const result = await runPersonaScriptAction({ personaId, environment });
      if (result.success) {
        setRun(result.data);
        setCloseSummary(null);
      } else {
        setError(result.error);
        setRun(null);
      }
    });
  };

  const handleExport = (format: 'json' | 'csv') => {
    if (!run) return;
    startExportTransition(async () => {
      const result: ActionResult<{ content: string }> = await exportTraceAction({
        runId: run.runId,
        format,
      });
      if (result.success) {
        const ext = format === 'json' ? 'json' : 'csv';
        const mime = format === 'json' ? 'application/json' : 'text/csv;charset=utf-8;';
        downloadFile(result.data.content, `conversation-trace-${run.runId}.${ext}`, mime);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-[var(--spacing-lg)]">
      <div className="flex flex-col gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]">
        <PersonaPicker value={personaId} onChange={setPersonaId} />

        <button
          type="button"
          onClick={handleRun}
          disabled={isPending}
          className="self-start rounded-[var(--radius-lg)] bg-[var(--color-primary)] px-4 py-2 text-[var(--text-label-md)] font-[var(--text-label-md--font-weight)] text-[var(--color-on-primary)] disabled:opacity-50"
        >
          {isPending ? 'Running script…' : 'Run persona script'}
        </button>
      </div>

      {error ? (
        <p className="text-[var(--text-body-main)] text-[var(--color-error)]">Error: {error}</p>
      ) : null}

      {run ? (
        <div className="flex flex-col gap-[var(--spacing-md)]">
          <div className="flex flex-wrap items-center justify-between gap-[var(--spacing-sm)]">
            <p className="text-[var(--text-body-main)] text-[var(--color-on-surface)]">
              Run <code>{run.runId}</code> · persona <strong>{run.personaId}</strong> ·{' '}
              {run.turns.length} turn{run.turns.length === 1 ? '' : 's'}
              {run.endedInCrisis ? ' · ended in crisis silence path' : ''}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleExport('json')}
                disabled={isExporting}
                className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-3 py-1.5 text-[var(--text-label-sm)] text-[var(--color-on-surface)] disabled:opacity-50"
              >
                Export JSON
              </button>
              <button
                type="button"
                onClick={() => handleExport('csv')}
                disabled={isExporting}
                className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-3 py-1.5 text-[var(--text-label-sm)] text-[var(--color-on-surface)] disabled:opacity-50"
              >
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => setShowSrsModal(true)}
                className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-3 py-1.5 text-[var(--text-label-sm)] text-[var(--color-on-surface)]"
              >
                Simulate session close
              </button>
            </div>
          </div>

          {run.endedInCrisis ? (
            <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-container-high)] px-3 py-2 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
              The pipeline routed to the crisis silence path mid-script. No
              further scripted turns were sent after that point, matching real
              pipeline behavior.
            </p>
          ) : null}

          {closeSummary ? (
            <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-container-high)] px-3 py-2 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
              Session close simulated
              {closeSummary.srsScore ? ` (SRS score ${closeSummary.srsScore})` : ''} &mdash;{' '}
              {closeSummary.summaryTriggered
                ? 'SessionSummary generation triggered via A13/A15.'
                : 'SessionSummary generation did not complete (see worker adapter output).'}
            </p>
          ) : null}

          <TurnStepper turns={run.turns} />

          <TraceViewer data={run.turns} title="Raw per-turn trace" />
        </div>
      ) : null}

      {run ? (
        <SrsSessionCloseModal
          open={showSrsModal}
          onClose={() => setShowSrsModal(false)}
          sessionId={run.sessionId}
          userId={run.uid}
          onResult={(result) =>
            setCloseSummary({
              summaryTriggered: result.summaryTriggered,
              srsScore: result.srsScore,
            })
          }
        />
      ) : null}
    </div>
  );
}
