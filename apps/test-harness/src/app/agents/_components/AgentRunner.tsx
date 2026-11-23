'use client';

import { useMemo, useState } from 'react';
import { trpc } from '@/trpc/client';
import TraceViewer from '@/app/components/TraceViewer';
import DownloadXlsxButton from '@/app/components/DownloadXlsxButton';
import { cell, downloadSheets } from '@/lib/xlsx-export';
import AgentPicker, { type PickableAgentId } from './AgentPicker';
import AgentForm from './AgentForm';

export default function AgentRunner() {
  const [agentId, setAgentId] = useState<PickableAgentId>('A1');
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});

  const schemaQuery = trpc.singleAgent.getAgentSchema.useQuery({ agentId });
  const invokeMutation = trpc.singleAgent.invokeAgent.useMutation();

  const fields = useMemo(() => schemaQuery.data?.fields ?? [], [schemaQuery.data]);

  const handleAgentChange = (next: PickableAgentId) => {
    setAgentId(next);
    setFormValues({});
    invokeMutation.reset();
  };

  const handleRun = () => {
    // Strip undefined values so we don't send noise the adapter would
    // otherwise have to special-case.
    const cleanedInput = Object.fromEntries(
      Object.entries(formValues).filter(([, v]) => v !== undefined),
    );
    invokeMutation.mutate({ agentId, input: cleanedInput });
  };

  /**
   * One agent, one workbook: the input that was sent, the output that came
   * back, and the routing metadata. Kept as two sheets rather than one wide
   * row because the input is free-form per agent and flattening it into
   * columns would produce a different header for every agent.
   */
  const handleExportXlsx = () => {
    const data = invokeMutation.data;
    if (!data) return;
    downloadSheets(`agent-${agentId}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`, [
      {
        name: 'Run',
        rows: [
          { parameter: 'Agent', value: agentId },
          { parameter: 'Latency (ms)', value: Math.round(data.latencyMs) },
          { parameter: 'Mock mode', value: data.mockMode === true },
        ],
      },
      {
        name: 'Input',
        rows: Object.entries(formValues).map(([field, value]) => ({
          field,
          value: cell(value),
        })),
      },
      { name: 'Output', rows: [{ output: cell(data.output) }] },
    ]);
  };

  return (
    <div className="flex flex-col gap-[var(--spacing-lg)]">
      <div className="flex flex-col gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]">
        <AgentPicker value={agentId} onChange={handleAgentChange} />

        {schemaQuery.isLoading ? (
          <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
            Loading input schema…
          </p>
        ) : (
          <AgentForm
            agentId={agentId}
            fields={fields}
            value={formValues}
            onChange={setFormValues}
          />
        )}

        {(agentId === 'A13' || agentId === 'A15') && (
          <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-container-high)] px-3 py-2 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
            A13 (summary) and A15 (memory) both trigger the same combined
            apps/worker call (POST /tasks/summary) — memory extraction runs
            internally inside session summary generation. This route is
            OIDC-protected, so it will likely fail with an error result in
            local/test environments without valid worker credentials — that
            is expected, not a bug in this harness.
          </p>
        )}

        <button
          type="button"
          onClick={handleRun}
          disabled={invokeMutation.isPending}
          className="self-start rounded-[var(--radius-lg)] bg-[var(--color-primary)] px-4 py-2 text-[var(--text-label-md)] font-[var(--text-label-md--font-weight)] text-[var(--color-on-primary)] disabled:opacity-50"
        >
          {invokeMutation.isPending ? 'Running…' : 'Run'}
        </button>
      </div>

      {invokeMutation.isError ? (
        <p className="text-[var(--text-body-main)] text-[var(--color-error)]">
          Invocation failed: {invokeMutation.error.message}
        </p>
      ) : null}

      {invokeMutation.data ? (
        <div className="flex flex-col gap-2">
          <p className="text-[var(--text-body-main)] text-[var(--color-on-surface)]">
            Latency: {invokeMutation.data.latencyMs.toFixed(1)}ms · Mock mode:{' '}
            {invokeMutation.data.mockMode ? 'yes' : 'no'}
          </p>
          <DownloadXlsxButton onClick={handleExportXlsx} label="Download .xlsx" />
          <TraceViewer
            data={invokeMutation.data.output}
            title={`${agentId} output`}
            defaultExpanded
          />
        </div>
      ) : null}
    </div>
  );
}
