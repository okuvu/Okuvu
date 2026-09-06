import type { TestEnvironment } from '@evia/shared-types';
import { getRunStatusPresentation } from '@/lib/run-status';

type StatusKey = 'running' | 'pass' | 'halt' | 'warning' | 'error';

const STATUS_ORDER: StatusKey[] = ['running', 'pass', 'warning', 'halt', 'error'];

export default function EnvStatusCard({
  environment,
  totalRuns,
  statusCounts,
  mostRecentRunAt,
}: {
  environment: TestEnvironment;
  totalRuns: number;
  statusCounts: Record<string, number>;
  mostRecentRunAt: string | Date | null;
}) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-lg)] shadow-[var(--shadow-soft)]">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[var(--text-section-header)] font-[var(--text-section-header--font-weight)] text-[var(--color-on-surface)]">
          {environment} environment
        </h2>
        <span className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
          {totalRuns} total run{totalRuns === 1 ? '' : 's'}
        </span>
      </div>

      {totalRuns === 0 ? (
        <p className="mt-4 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
          No test runs recorded yet for this environment.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-[var(--spacing-md)]">
          {STATUS_ORDER.map((status) => {
            const count = statusCounts[status] ?? 0;
            const { label, colorClass, dotClass, icon } = getRunStatusPresentation(status);
            return (
              <div
                key={status}
                className={`flex items-center gap-2 rounded-[var(--radius-full)] border px-3 py-1.5 ${colorClass}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
                <span aria-hidden="true">{icon}</span>
                <span className="text-[var(--text-label-sm)] font-medium">{label}</span>
                <span className="text-[var(--text-label-sm)] font-bold">{count}</span>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
        Most recent run:{' '}
        {mostRecentRunAt ? new Date(mostRecentRunAt).toLocaleString() : 'none yet'}
      </p>
    </div>
  );
}
