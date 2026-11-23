'use client';

import Link from 'next/link';
import { trpc } from '@/trpc/client';

/**
 * The goals at a glance on the client's profile page.
 *
 * The queue is worked one at a time, so the card leads with the current focus
 * rather than the whole list: opening the profile should answer "what are we
 * working on" without a click. The full list, the order and the therapist-only
 * guide live on the Goals tab.
 */
export function GoalsCard({ clientId }: { clientId: string }) {
  const goalsQuery = trpc.goals.list.useQuery({ clientId }, { enabled: Boolean(clientId) });

  const goals = goalsQuery.data?.goals ?? [];
  const focus = goals.find((goal) => goal.id === goalsQuery.data?.focusGoalId) ?? null;
  const activeCount = goalsQuery.data?.activeCount ?? 0;
  const achievedCount = goals.filter((goal) => goal.status === 'achieved').length;

  return (
    <div className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">GOALS</h2>
        <Link
          href={`/clients/${clientId}/goals`}
          className="text-sm font-medium text-royal-purple hover:underline"
        >
          {goals.length === 0 ? 'Set goals' : 'View goals'} &rarr;
        </Link>
      </div>

      {goalsQuery.isLoading ? (
        <p className="text-sm text-gray-500">Loading&hellip;</p>
      ) : focus ? (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm text-gray-500">In focus</span>
            <span className="text-sm font-medium text-gray-900 text-right">{focus.text}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Active goals</span>
            <span className="text-sm font-medium text-gray-900">{activeCount}</span>
          </div>
          {achievedCount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Achieved</span>
              <span className="text-sm font-medium text-gray-900">{achievedCount}</span>
            </div>
          )}
        </div>
      ) : goals.length === 0 ? (
        <p className="text-sm text-gray-500">
          No goals yet. Goals are worked one at a time — set the first one on the Goals tab.
        </p>
      ) : (
        <p className="text-sm text-gray-500">
          Nothing active. Every goal is achieved or dropped.
        </p>
      )}
    </div>
  );
}
