'use client';

import { useState } from 'react';
import type { TestAgentId } from '@evia/shared-types';
import { trpc } from '@/trpc/client';
import { AgentPicker, InputJsonField, parseInputJson } from './AgentInputPicker';
import RunDiffView from './RunDiffView';

export default function RestartPanel() {
  const [agentId, setAgentId] = useState<TestAgentId>('A1');
  const [inputRaw, setInputRaw] = useState('{}');
  const [sessionId, setSessionId] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  const runAcrossRestarts = trpc.determinism.runAcrossRestarts.useMutation();

  const handleRun = () => {
    const parsed = parseInputJson(inputRaw);
    if (!parsed.ok) {
      setParseError(parsed.error);
      return;
    }
    setParseError(null);
    runAcrossRestarts.mutate({
      agentId,
      input: parsed.value,
      sessionId: sessionId.trim() === '' ? undefined : sessionId.trim(),
    });
  };

  return (
    <div className="flex flex-col gap-[var(--spacing-lg)]">
      <div className="flex flex-col gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]">
        <h2 className="text-[var(--text-title-sm)] font-[var(--text-title-sm--font-weight)] text-[var(--color-on-surface)]">
          Restart determinism check
        </h2>
        <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
          Runs the agent once, clears the in-memory retrieved-context and tool-result caches for
          the session (simulating a process restart), then runs again and diffs the outputs.
        </p>

        <div className="flex flex-wrap items-end gap-[var(--spacing-md)]">
          <AgentPicker value={agentId} onChange={setAgentId} />

          <label className="flex flex-col gap-1">
            <span className="text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface-variant)]">
              Session ID (optional)
            </span>
            <input
              type="text"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="test-harness-determinism-session"
              className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface)]"
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
          disabled={runAcrossRestarts.isPending}
          className="self-start rounded-[var(--radius-lg)] bg-[var(--color-primary)] px-4 py-2 text-[var(--text-label-md)] font-[var(--text-label-md--font-weight)] text-[var(--color-on-primary)] disabled:opacity-50"
        >
          {runAcrossRestarts.isPending ? 'Running…' : 'Run → clear caches → run again'}
        </button>
      </div>

      {runAcrossRestarts.isError ? (
        <p className="text-[var(--text-body-main)] text-[var(--color-error)]">
          Run failed: {runAcrossRestarts.error.message}
        </p>
      ) : null}

      {runAcrossRestarts.data ? (
        <RunDiffView
          before={runAcrossRestarts.data.before}
          after={runAcrossRestarts.data.after}
          changed={runAcrossRestarts.data.changed}
        />
      ) : null}
    </div>
  );
}
