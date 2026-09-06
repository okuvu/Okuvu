'use client';

import { useMemo, useState } from 'react';
import type { TestAgentId } from '@evia/shared-types';
import { trpc } from '@/trpc/client';
import { useEnvironment } from '@/lib/environment-context';
import RunStatusBadge from '@/app/components/RunStatusBadge';
import type { TestRunStatus } from '@evia/shared-types';
import { computeActivation, tryDisable } from '@/lib/dependency-graph';
import type { AgentTraceEntry } from '@/lib/pipeline-runner';
import PipelineDiagram from './PipelineDiagram';
import AgentToggle from './AgentToggle';
import MockModePanel from './MockModePanel';
import AgentTracePanel from './AgentTracePanel';
import { deriveAgentStatuses } from './deriveAgentStatuses';
import {
  buildTestModeFromMockValues,
  skippedAgentsForMockValues,
  type MockValues,
} from './mock-mode-mapping';

const CONTROL_CLASS =
  'rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]';

export default function PipelineContent() {
  const { environment } = useEnvironment();

  // ─── Toggle / activation state — every transition below is computed by
  // dependency-graph.ts's computeActivation()/tryDisable(), never re-derived
  // here.
  const [active, setActive] = useState<TestAgentId[]>([]);
  const [manuallySelected, setManuallySelected] = useState<TestAgentId[]>([]);
  const [autoActivated, setAutoActivated] = useState<Map<TestAgentId, TestAgentId[]>>(new Map());
  const [banner, setBanner] = useState<string | null>(null);

  // ─── Mock mode state ────────────────────────────────────────────────────
  const [mockEnabled, setMockEnabled] = useState(false);
  const [mockTargetAgent, setMockTargetAgent] = useState<TestAgentId>('A2');
  const [mockValues, setMockValues] = useState<MockValues>({});

  // ─── Run state ──────────────────────────────────────────────────────────
  const [message, setMessage] = useState('I feel overwhelmed today.');
  const runMutation = trpc.pipeline.runFullPipeline.useMutation();

  const skippedAgents = useMemo(
    () => (mockEnabled ? skippedAgentsForMockValues(mockValues) : new Set<TestAgentId>()),
    [mockEnabled, mockValues],
  );

  const statuses = useMemo(
    () =>
      deriveAgentStatuses({
        active: mockEnabled ? Array.from(new Set([...active, mockTargetAgent])) : active,
        manuallySelected: mockEnabled
          ? Array.from(new Set([...manuallySelected, mockTargetAgent]))
          : manuallySelected,
        autoActivated,
        skipped: skippedAgents,
      }),
    [active, manuallySelected, autoActivated, skippedAgents, mockEnabled, mockTargetAgent],
  );

  const handleEnable = (agent: TestAgentId) => {
    const result = computeActivation(agent, active);
    setActive(result.active);
    setManuallySelected(result.manuallySelected);
    setAutoActivated(result.autoActivated);
    setBanner(result.explanation);
  };

  const handleDisable = (agent: TestAgentId) => {
    const result = tryDisable(agent, active);
    if (!result.allowed) {
      setBanner(result.explanation);
      return;
    }
    setActive((prev) => prev.filter((a) => a !== agent));
    setManuallySelected((prev) => prev.filter((a) => a !== agent));
    setAutoActivated((prev) => {
      const next = new Map(prev);
      next.delete(agent);
      return next;
    });
    setBanner(`Deactivated ${agent}`);
  };

  const handleRun = () => {
    const testMode = mockEnabled ? buildTestModeFromMockValues(mockValues) : undefined;
    runMutation.mutate(
      { message, environment, testMode },
      {
        onError: (err) => setBanner(`Run failed: ${err.message}`),
        onSuccess: () => setBanner(null),
      },
    );
  };

  const trace = (runMutation.data?.trace ?? []) as AgentTraceEntry[];
  const runStatus: TestRunStatus | null = runMutation.isPending
    ? 'running'
    : runMutation.isError
      ? 'error'
      : runMutation.data?.result?.type === 'error'
        ? 'error'
        : runMutation.data?.result?.type === 'crisis'
          ? 'halt'
          : runMutation.data
            ? 'pass'
            : null;

  return (
    <div className="flex flex-col gap-[var(--spacing-lg)]">
      <div className="flex flex-col gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]">
        <h2 className="text-[var(--text-label-md)] font-[var(--text-label-md--font-weight)] text-[var(--color-on-surface)]">
          Pipeline diagram
        </h2>
        <PipelineDiagram statuses={statuses} />

        <div className="flex flex-wrap gap-2 border-t border-[var(--color-outline-variant)] pt-[var(--spacing-md)]">
          {statuses.map((status) => (
            <AgentToggle
              key={status.agent}
              status={status}
              onEnable={handleEnable}
              onDisable={handleDisable}
            />
          ))}
        </div>
      </div>

      {banner ? (
        <div className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-high)] px-3 py-2 text-[var(--text-label-sm)] text-[var(--color-on-surface)]">
          <span>{banner}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]"
            aria-label="Dismiss"
          >
            &#10005;
          </button>
        </div>
      ) : null}

      <MockModePanel
        enabled={mockEnabled}
        onToggleEnabled={setMockEnabled}
        targetAgent={mockTargetAgent}
        onTargetAgentChange={setMockTargetAgent}
        values={mockValues}
        onValuesChange={setMockValues}
      />

      <div className="flex flex-col gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]">
        <label className="flex flex-col gap-1">
          <span className="text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface-variant)]">
            Message
          </span>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className={CONTROL_CLASS}
          />
        </label>

        <div className="flex items-center gap-[var(--spacing-md)]">
          <button
            type="button"
            onClick={handleRun}
            disabled={runMutation.isPending}
            className="self-start rounded-[var(--radius-lg)] bg-[var(--color-primary)] px-4 py-2 text-[var(--text-label-md)] font-[var(--text-label-md--font-weight)] text-[var(--color-on-primary)] disabled:opacity-50"
          >
            {runMutation.isPending ? 'Running…' : 'Run Pipeline'}
          </button>
          {runStatus ? <RunStatusBadge status={runStatus} /> : null}
          {runMutation.data ? (
            <span className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
              Run {runMutation.data.runId}
            </span>
          ) : null}
        </div>
      </div>

      {trace.length > 0 ? (
        <div className="flex flex-col gap-[var(--spacing-md)]">
          <h2 className="text-[var(--text-label-md)] font-[var(--text-label-md--font-weight)] text-[var(--color-on-surface)]">
            Per-agent trace
          </h2>
          {trace.map((entry, i) => (
            <AgentTracePanel key={`${entry.agentId}-${i}`} entry={entry} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
