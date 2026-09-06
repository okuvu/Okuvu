'use client';

import type { PerTurnTrace } from '@/lib/trace-export';

const RESULT_TYPE_LABEL: Record<PerTurnTrace['resultType'], string> = {
  agent_turn: 'Reply',
  crisis: 'Crisis (silence path)',
  error: 'Error',
};

export default function TurnStepper({ turns }: { turns: PerTurnTrace[] }) {
  if (turns.length === 0) {
    return (
      <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
        No turns yet.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-[var(--spacing-md)]">
      {turns.map((turn) => (
        <li
          key={turn.turnNumber}
          className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]"
        >
          <div className="flex flex-wrap items-center gap-2 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
            <span className="font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface)]">
              Turn {turn.turnNumber}
            </span>
            <span>{RESULT_TYPE_LABEL[turn.resultType]}</span>
            {turn.safetyState ? <span>Safety: {turn.safetyState}</span> : null}
            <span>{turn.latencyMs.toFixed(0)}ms</span>
          </div>

          <div className="mt-2 flex flex-col gap-2">
            <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-container-high)] px-3 py-2">
              <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">User</p>
              <p className="text-[var(--text-body-main)] text-[var(--color-on-surface)]">
                {turn.message}
              </p>
            </div>

            <div className="rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] px-3 py-2">
              <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">Agent</p>
              <p className="text-[var(--text-body-main)] text-[var(--color-on-surface)]">
                {turn.response ?? '(no reply — silence path)'}
              </p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
