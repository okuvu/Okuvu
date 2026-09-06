import type { TestRunStatus } from '@evia/shared-types';
import RunStatusBadge from '@/app/components/RunStatusBadge';

export interface RecentRunRow {
  id: string;
  status: TestRunStatus;
  agent: string | null;
  created_at: string | Date;
  altitude: number;
}

export default function RecentRunsTable({ runs }: { runs: RecentRunRow[] }) {
  if (runs.length === 0) {
    return (
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-lg)] shadow-[var(--shadow-soft)]">
        <h2 className="text-[var(--text-section-header)] font-[var(--text-section-header--font-weight)] text-[var(--color-on-surface)]">
          Recent runs
        </h2>
        <p className="mt-4 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
          No runs yet.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-lg)] shadow-[var(--shadow-soft)]">
      <h2 className="text-[var(--text-section-header)] font-[var(--text-section-header--font-weight)] text-[var(--color-on-surface)]">
        Recent runs
      </h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--color-outline-variant)] text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
              <th className="py-2 pr-4 font-medium">Run</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Agent</th>
              <th className="py-2 pr-4 font-medium">Altitude</th>
              <th className="py-2 pr-4 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr
                key={run.id}
                className="border-b border-[var(--color-outline-variant)] last:border-0"
              >
                <td className="py-2 pr-4 text-[var(--text-body-main)] text-[var(--color-on-surface)]">
                  {run.id.slice(0, 8)}
                </td>
                <td className="py-2 pr-4">
                  <RunStatusBadge status={run.status} />
                </td>
                <td className="py-2 pr-4 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
                  {run.agent ?? '—'}
                </td>
                <td className="py-2 pr-4 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
                  {run.altitude}
                </td>
                <td className="py-2 pr-4 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
                  {new Date(run.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
