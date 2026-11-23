'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { useClientHeader } from '../_components/useClientHeader';
import { TabStrip } from '../_components/TabStrip';
import { GOAL_GUIDE, GOAL_GUIDE_STATUS } from './goal-guide';

type GoalStatus = 'active' | 'achieved' | 'dropped';

function statusLabel(status: string): string {
  if (status === 'achieved') return 'Achieved';
  if (status === 'dropped') return 'Dropped';
  return 'Active';
}

export default function ClientGoalsPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const [goalText, setGoalText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { label: clientLabel } = useClientHeader(clientId);

  const goalsQuery = trpc.goals.list.useQuery({ clientId }, { enabled: Boolean(clientId) });

  const onError = (err: { message?: string }, fallback: string) => {
    setErrorMessage(err.message || fallback);
    setTimeout(() => setErrorMessage(null), 5000);
  };

  const addGoal = trpc.goals.add.useMutation({
    onSuccess: async () => {
      setGoalText('');
      setMessage('Goal added to the end of the list.');
      setTimeout(() => setMessage(null), 4000);
      await goalsQuery.refetch();
    },
    onError: (err) => onError(err, 'Could not save the goal.'),
  });

  const setStatus = trpc.goals.setStatus.useMutation({
    onSuccess: async () => {
      await goalsQuery.refetch();
    },
    onError: (err) => onError(err, 'Could not update the goal.'),
  });

  const moveGoal = trpc.goals.move.useMutation({
    onSuccess: async () => {
      await goalsQuery.refetch();
    },
    onError: (err) => onError(err, 'Could not reorder the goals.'),
  });

  const goals = goalsQuery.data?.goals ?? [];
  const focusGoalId = goalsQuery.data?.focusGoalId ?? null;
  const activeCount = goalsQuery.data?.activeCount ?? 0;
  const focusGoal = goals.find((goal) => goal.id === focusGoalId) ?? null;

  return (
    <div className="min-h-screen bg-oat">
      <div className="p-4 md:p-8">
        <div className="mx-auto max-w-3xl space-y-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/dashboard" className="hover:text-royal-purple transition-colors">
              Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <Link href={`/clients/${clientId}`} className="hover:text-royal-purple transition-colors">
              {clientLabel}
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-900 font-medium">Goals</span>
          </div>

          <TabStrip clientId={clientId} active="goals" />

          {/* What you are working on now */}
          <div className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline border-l-4 border-l-violet">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              IN FOCUS
            </h2>
            {goalsQuery.isLoading ? (
              <p className="text-sm text-gray-500">Loading&hellip;</p>
            ) : focusGoal ? (
              <>
                <p className="text-base font-medium text-gray-900">{focusGoal.text}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {activeCount === 1
                    ? 'The only active goal.'
                    : `Goal 1 of ${activeCount} active. The rest wait their turn.`}
                </p>
              </>
            ) : goals.length === 0 ? (
              <p className="text-sm text-gray-500">
                No goals yet. Write the first one below — you and {clientLabel} work on one at a
                time.
              </p>
            ) : (
              <p className="text-sm text-gray-500">
                Nothing active. Every goal is achieved or dropped — add the next one below.
              </p>
            )}
          </div>

          {/* The list */}
          <div className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              WORKING GOALS
            </h2>
            <p className="text-xs text-gray-500">
              Worked one at a time, top to bottom. Written by you and not shown to {clientLabel};
              short enough that an assignment can point at one.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!goalText.trim() || !clientId) return;
                addGoal.mutate({ clientUserId: clientId, text: goalText.trim() });
              }}
              className="mt-3 flex gap-2"
            >
              <input
                value={goalText}
                onChange={(e) => setGoalText(e.target.value)}
                maxLength={300}
                placeholder="e.g. say no to one extra shift a week"
                aria-label="New working goal"
                className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              />
              <button
                type="submit"
                disabled={addGoal.isPending || !goalText.trim()}
                className="rounded-lg border border-violet px-3 py-2 text-xs font-medium text-royal-purple hover:bg-lavender-wash disabled:opacity-60"
              >
                {addGoal.isPending ? 'Saving...' : 'Add goal'}
              </button>
            </form>

            {message && (
              <p role="status" className="mt-2 text-xs text-royal-purple">
                {message}
              </p>
            )}
            {errorMessage && (
              <p role="alert" className="mt-2 text-xs text-danger">
                {errorMessage}
              </p>
            )}

            <div className="mt-4 space-y-2">
              {goals.length === 0 && (
                <p className="text-xs italic text-gray-500">No goals yet.</p>
              )}
              {goals.map((goal, index) => {
                const isFocus = goal.id === focusGoalId;
                const isActive = goal.status === 'active';
                return (
                  <div
                    key={goal.id}
                    className={`rounded-lg border px-3 py-2 ${
                      isFocus ? 'border-violet bg-lavender-wash' : 'border-hairline bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <span className="mt-0.5 w-5 shrink-0 text-xs tabular-nums text-gray-400">
                          {index + 1}.
                        </span>
                        <div className="min-w-0">
                          <p
                            className={`text-sm ${
                              isActive ? 'text-gray-900' : 'text-gray-500 line-through'
                            }`}
                          >
                            {goal.text}
                          </p>
                          <p className="mt-0.5 text-[11px] uppercase tracking-wider text-gray-400">
                            {isFocus ? 'In focus' : statusLabel(goal.status)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-7 text-[11px]">
                      {isActive && !isFocus && (
                        <button
                          type="button"
                          onClick={() =>
                            moveGoal.mutate({ goalId: goal.id, clientId, direction: 'top' })
                          }
                          disabled={moveGoal.isPending}
                          className="text-royal-purple hover:underline disabled:opacity-60"
                        >
                          Make focus
                        </button>
                      )}
                      {index > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            moveGoal.mutate({ goalId: goal.id, clientId, direction: 'up' })
                          }
                          disabled={moveGoal.isPending}
                          className="text-gray-600 hover:underline disabled:opacity-60"
                        >
                          Move up
                        </button>
                      )}
                      {index < goals.length - 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            moveGoal.mutate({ goalId: goal.id, clientId, direction: 'down' })
                          }
                          disabled={moveGoal.isPending}
                          className="text-gray-600 hover:underline disabled:opacity-60"
                        >
                          Move down
                        </button>
                      )}
                      {isActive ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setStatus.mutate({
                                goalId: goal.id,
                                clientId,
                                status: 'achieved' as GoalStatus,
                              })
                            }
                            disabled={setStatus.isPending}
                            className="text-royal-purple hover:underline disabled:opacity-60"
                          >
                            Mark achieved
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setStatus.mutate({
                                goalId: goal.id,
                                clientId,
                                status: 'dropped' as GoalStatus,
                              })
                            }
                            disabled={setStatus.isPending}
                            className="text-gray-600 hover:underline disabled:opacity-60"
                          >
                            Drop
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setStatus.mutate({
                              goalId: goal.id,
                              clientId,
                              status: 'active' as GoalStatus,
                            })
                          }
                          disabled={setStatus.isPending}
                          className="text-royal-purple hover:underline disabled:opacity-60"
                        >
                          Reopen
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Therapist-only guide */}
          <details className="group rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
            <summary className="cursor-pointer select-none">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                How to set goals
              </span>
              <span className="ml-2 text-[11px] text-gray-400">Therapist only</span>
            </summary>

            <p className="mt-3 rounded-lg bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-800">
              <strong>This page is for you.</strong> The guide below is clinical guidance about the
              tool and is not shown to {clientLabel}.
              <br />
              <span className="font-medium">Copy status: {GOAL_GUIDE_STATUS}.</span>
            </p>

            <div className="mt-4 space-y-3">
              {GOAL_GUIDE.map((section) => (
                <div key={section.heading}>
                  <h3 className="text-sm font-semibold text-gray-900">{section.heading}</h3>
                  <p className="mt-0.5 text-sm leading-relaxed text-gray-700">{section.body}</p>
                </div>
              ))}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
