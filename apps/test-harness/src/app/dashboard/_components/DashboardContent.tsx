'use client';

import { useEnvironment } from '@/lib/environment-context';
import { trpc } from '@/trpc/client';
import EnvStatusCard from './EnvStatusCard';
import RecentRunsTable from './RecentRunsTable';
import GateSummaryCard from './GateSummaryCard';
import GateSignOff from './GateSignOff';
import ScreensNav from './ScreensNav';

export default function DashboardContent() {
  const { environment } = useEnvironment();
  const { data, isLoading, isError, error } = trpc.dashboard.getOverview.useQuery({
    environment,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-[var(--spacing-lg)]">
        <ScreensNav />
        <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
          Loading dashboard…
        </p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col gap-[var(--spacing-lg)]">
        <ScreensNav />
        <p className="text-[var(--text-body-main)] text-[var(--color-error)]">
          Failed to load dashboard: {error?.message ?? 'unknown error'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--spacing-lg)]">
      <ScreensNav />
      <EnvStatusCard
        environment={data.environment}
        totalRuns={data.envStatus.totalRuns}
        statusCounts={data.envStatus.statusCounts}
        mostRecentRunAt={data.envStatus.mostRecentRunAt}
      />
      <RecentRunsTable runs={data.recentRuns} />
      <GateSummaryCard gates={data.gateSummary} configDrift={data.configDrift} />
      <GateSignOff environment={environment} />
    </div>
  );
}
