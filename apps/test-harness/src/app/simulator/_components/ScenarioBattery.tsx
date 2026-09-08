'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { PERSONA_SCRIPTS, PERSONA_LABELS, type PersonaId } from '@/lib/persona-scripts';
import { summarizePersonaRun, getRowColorClass } from '@/lib/plain-language-signals';
import type { PerTurnTrace } from '@/lib/trace-export';
import type { TestEnvironment } from '@okuvu/shared-types';
import ChatPane from './ChatPane';
import FlowStatusPane from './FlowStatusPane';
import BreathingPulse from './BreathingPulse';
import PanelHeader from './PanelHeader';

const ALL_PERSONA_IDS = Object.keys(PERSONA_SCRIPTS) as PersonaId[];

interface RowState {
  status: 'running' | 'done' | 'error';
  turns?: PerTurnTrace[];
  endedInCrisis?: boolean;
  error?: string;
}

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined leading-none ${className}`} aria-hidden="true">
      {name}
    </span>
  );
}

export default function ScenarioBattery({ environment }: { environment: TestEnvironment }) {
  const [results, setResults] = useState<Partial<Record<PersonaId, RowState>>>({});
  const [expanded, setExpanded] = useState<PersonaId | null>(null);
  const [running, setRunning] = useState(false);

  const runPersonaScriptMutation = trpc.conversation.runPersonaScript.useMutation();

  const handleRunAll = async () => {
    setRunning(true);
    setResults(Object.fromEntries(ALL_PERSONA_IDS.map((id) => [id, { status: 'running' as const }])));

    await Promise.all(
      ALL_PERSONA_IDS.map(async (personaId) => {
        try {
          const result = await runPersonaScriptMutation.mutateAsync({ personaId, environment });
          setResults((prev) => ({
            ...prev,
            [personaId]: { status: 'done', turns: result.turns, endedInCrisis: result.endedInCrisis },
          }));
        } catch (err) {
          setResults((prev) => ({
            ...prev,
            [personaId]: { status: 'error', error: err instanceof Error ? err.message : String(err) },
          }));
        }
      }),
    );

    setRunning(false);
  };

  return (
    <div className="flex flex-col gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)] shadow-[var(--shadow-soft)]">
      <PanelHeader
        icon="playlist_add_check"
        action={
          <button
            type="button"
            onClick={handleRunAll}
            disabled={running}
            className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-low)] px-3 py-1.5 text-[var(--text-label-sm)] text-[var(--color-on-surface)] transition-colors hover:bg-[var(--color-surface-container-high)] disabled:opacity-50"
          >
            {running ? <BreathingPulse size={10} /> : <Icon name="play_arrow" className="text-[16px]" />}
            {running ? 'Running…' : 'Run all scenarios'}
          </button>
        }
      >
        Scenario battery
      </PanelHeader>

      {Object.keys(results).length === 0 ? (
        <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
          Runs all 4 built-in scenarios automatically and reports what happened — no typing required.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {ALL_PERSONA_IDS.map((personaId) => {
            const row = results[personaId];
            if (!row) return null;
            const isExpanded = expanded === personaId;

            return (
              <li key={personaId} className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)]">
                <button
                  type="button"
                  onClick={() => row.status === 'done' && setExpanded(isExpanded ? null : personaId)}
                  disabled={row.status !== 'done'}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left disabled:cursor-default"
                >
                  <span className="text-[var(--text-body-main)] text-[var(--color-on-surface)]">
                    {PERSONA_LABELS[personaId]}
                  </span>
                  {row.status === 'running' ? (
                    <BreathingPulse size={10} />
                  ) : row.status === 'error' ? (
                    <span className={`rounded-[var(--radius-md)] border px-2 py-0.5 text-[var(--text-label-sm)] ${getRowColorClass('blocked')}`}>
                      Failed to run
                    </span>
                  ) : (
                    (() => {
                      const { status, summary } = summarizePersonaRun(row.turns ?? [], row.endedInCrisis ?? false);
                      return (
                        <span className={`rounded-[var(--radius-md)] border px-2 py-0.5 text-[var(--text-label-sm)] ${getRowColorClass(status)}`}>
                          {summary}
                        </span>
                      );
                    })()
                  )}
                </button>

                {isExpanded && row.status === 'done' ? (
                  <div className="grid grid-cols-1 gap-[var(--spacing-sm)] border-t border-[var(--color-outline-variant)] p-[var(--spacing-sm)] lg:grid-cols-2">
                    <div className="h-[320px]">
                      <ChatPane
                        turns={row.turns ?? []}
                        pendingMessage={null}
                        inputValue=""
                        onInputChange={() => {}}
                        onSend={() => {}}
                        disabled
                        disabledReason={null}
                        readOnly
                      />
                    </div>
                    <FlowStatusPane latestTurn={(row.turns ?? [])[(row.turns?.length ?? 1) - 1] ?? null} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
