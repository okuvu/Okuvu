'use client';

import { trpc } from '@/trpc/client';
import { SAFETY_LABELS, type SafetyState, type GovernanceState } from '@okuvu/shared-types';

// Fixed row/column order for the two axes. Neither is exported as a const
// array from shared-types, so mirrored here (matches the underlying
// apps/test-harness/src/lib/a8-state-space.ts enumeration order).
const SAFETY_STATES: readonly SafetyState[] = ['S0', 'S1', 'S2', 'S3', 'S4'];
const GOVERNANCE_STATES: readonly GovernanceState[] = ['Active', 'Restricted', 'Blocked'];

function decisionLabel(decision: { agent: string; mode?: string }): string {
  return decision.mode ? `${decision.agent} / ${decision.mode}` : decision.agent;
}

export default function A8StateMatrix() {
  const { data, isLoading, isError, error } = trpc.determinism.enumerateA8StateSpace.useQuery();

  if (isLoading) {
    return (
      <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
        Enumerating A8 state space…
      </p>
    );
  }

  if (isError || !data) {
    return (
      <p className="text-[var(--text-body-main)] text-[var(--color-error)]">
        Failed to load A8 state space: {error?.message ?? 'unknown error'}
      </p>
    );
  }

  const cellFor = (safety: SafetyState, governance: GovernanceState) =>
    data.find((c) => c.safety_state === safety && c.governance_state === governance);

  const passCount = data.filter((c) => c.pass).length;

  return (
    <div className="flex flex-col gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]">
      <div className="flex items-center justify-between">
        <h2 className="text-[var(--text-title-sm)] font-[var(--text-title-sm--font-weight)] text-[var(--color-on-surface)]">
          A8 router state space (5 safety x 3 governance)
        </h2>
        <span className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
          {passCount} / {data.length} cells pass
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="p-2 text-left text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
                Safety \ Governance
              </th>
              {GOVERNANCE_STATES.map((g) => (
                <th
                  key={g}
                  className="p-2 text-left text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]"
                >
                  {g}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SAFETY_STATES.map((safety) => (
              <tr key={safety}>
                <td className="p-2 text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface)]">
                  {safety} <span className="text-[var(--color-on-surface-variant)]">({SAFETY_LABELS[safety]})</span>
                </td>
                {GOVERNANCE_STATES.map((governance) => {
                  const cell = cellFor(safety, governance);
                  const pass = cell?.pass ?? false;
                  return (
                    <td key={governance} className="p-1">
                      <div
                        className={`flex flex-col gap-0.5 rounded-[var(--radius-md)] border p-2 ${
                          pass
                            ? 'border-emerald-500/40 bg-emerald-500/15'
                            : 'border-red-500/40 bg-red-500/15'
                        }`}
                        title={cell ? JSON.stringify({ actual: cell.actual, expected: cell.expected }) : undefined}
                      >
                        <span className="text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface)]">
                          {pass ? 'PASS' : 'FAIL'}
                        </span>
                        <span className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
                          {cell ? decisionLabel(cell.actual) : '—'}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
