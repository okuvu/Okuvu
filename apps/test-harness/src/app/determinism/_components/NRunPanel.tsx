'use client';

import { useState } from 'react';
import type { TestAgentId } from '@evia/shared-types';
import { trpc } from '@/trpc/client';
import TraceViewer from '@/app/components/TraceViewer';
import { AgentPicker, InputJsonField, parseInputJson } from './AgentInputPicker';

export default function NRunPanel() {
  const [agentId, setAgentId] = useState<TestAgentId>('A8');
  const [inputRaw, setInputRaw] = useState('{}');
  const [n, setN] = useState(5);
  const [parseError, setParseError] = useState<string | null>(null);
  const [expandedRun, setExpandedRun] = useState<number | null>(null);

  const runNtimes = trpc.determinism.runNtimes.useMutation();

  const handleRun = () => {
    const parsed = parseInputJson(inputRaw);
    if (!parsed.ok) {
      setParseError(parsed.error);
      return;
    }
    setParseError(null);
    setExpandedRun(null);
    runNtimes.mutate({ agentId, input: parsed.value, n });
  };

  return (
    <div className="flex flex-col gap-[var(--spacing-lg)]">
      <div className="flex flex-col gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]">
        <h2 className="text-[var(--text-title-sm)] font-[var(--text-title-sm--font-weight)] text-[var(--color-on-surface)]">
          N-run determinism check
        </h2>

        <div className="flex flex-wrap items-end gap-[var(--spacing-md)]">
          <AgentPicker value={agentId} onChange={setAgentId} />

          <label className="flex flex-col gap-1">
            <span className="text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface-variant)]">
              N (runs)
            </span>
            <input
              type="number"
              min={1}
              max={50}
              value={n}
              onChange={(e) => setN(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
              className="w-24 rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
            />
          </label>
        </div>

        <InputJsonField value={inputRaw} onChange={setInputRaw} />

        {parseError ? (
          <p className="text-[var(--text-label-sm)] text-[var(--color-error)]">{parseError}</p>
        ) : null}

        <button
          type="button"
          onClick={handleRun}
          disabled={runNtimes.isPending}
          className="self-start rounded-[var(--radius-lg)] bg-[var(--color-primary)] px-4 py-2 text-[var(--text-label-md)] font-[var(--text-label-md--font-weight)] text-[var(--color-on-primary)] disabled:opacity-50"
        >
          {runNtimes.isPending ? 'Running…' : `Run ${n}x`}
        </button>
      </div>

      {runNtimes.isError ? (
        <p className="text-[var(--text-body-main)] text-[var(--color-error)]">
          Run failed: {runNtimes.error.message}
        </p>
      ) : null}

      {runNtimes.data ? (
        <div className="flex flex-col gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]">
          <p className="text-[var(--text-body-main)] text-[var(--color-on-surface)]">
            <span
              className={
                runNtimes.data.exactMatchCount === runNtimes.data.runs.length
                  ? 'font-[var(--text-label-md--font-weight)] text-emerald-500'
                  : 'font-[var(--text-label-md--font-weight)] text-red-500'
              }
            >
              {runNtimes.data.exactMatchCount} / {runNtimes.data.runs.length}
            </span>{' '}
            runs identical.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[var(--text-body-main)] text-[var(--color-on-surface)]">
              <thead>
                <tr className="border-b border-[var(--color-outline-variant)]">
                  <th className="p-2 text-left text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
                    #
                  </th>
                  <th className="p-2 text-left text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
                    Hash
                  </th>
                  <th className="p-2 text-left text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
                    Latency
                  </th>
                  <th className="p-2 text-left text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
                    Output
                  </th>
                </tr>
              </thead>
              <tbody>
                {runNtimes.data.runs.map((run, i) => (
                  <tr key={i} className="border-b border-[var(--color-outline-variant)]">
                    <td className="p-2">{i + 1}</td>
                    <td className="p-2" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                      {run.hash.slice(0, 12)}
                      {run.hash === runNtimes.data!.runs[0].hash ? (
                        <span className="ml-2 text-[var(--text-label-sm)] text-emerald-500">match</span>
                      ) : (
                        <span className="ml-2 text-[var(--text-label-sm)] text-red-500">diff</span>
                      )}
                    </td>
                    <td className="p-2">{run.latencyMs.toFixed(1)}ms</td>
                    <td className="p-2">
                      <button
                        type="button"
                        onClick={() => setExpandedRun(expandedRun === i ? null : i)}
                        className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-3 py-1 text-[var(--text-label-sm)] text-[var(--color-on-surface)]"
                      >
                        {expandedRun === i ? 'Hide' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {expandedRun !== null ? (
            <TraceViewer
              data={runNtimes.data.runs[expandedRun].output}
              title={`Run ${expandedRun + 1} output`}
              defaultExpanded
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
