'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/trpc/client';
import { useClientHeader } from '../_components/useClientHeader';
import { TabStrip } from '../_components/TabStrip';
import { ExposureLadderList } from './_components/ExposureLadderList';
import {
  inLadderOrder,
  parseDifficulty,
  swapPositions,
  type LadderStep,
} from '@/lib/exposure-ladder';

export default function ClientExposurePage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const [label, setLabel] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { label: clientLabel } = useClientHeader(clientId);

  const ladderQuery = trpc.exposure.list.useQuery({ clientId }, { enabled: Boolean(clientId) });

  const onError = (err: { message?: string }, fallback: string) => {
    setErrorMessage(err.message || fallback);
    setTimeout(() => setErrorMessage(null), 5000);
  };

  const addStep = trpc.exposure.add.useMutation({
    onSuccess: async () => {
      setLabel('');
      setDifficulty('');
      setFormError(null);
      setMessage('Step added to the end of the ladder.');
      setTimeout(() => setMessage(null), 4000);
      await ladderQuery.refetch();
    },
    onError: (err) => onError(err, 'Could not add the step.'),
  });

  const updateStep = trpc.exposure.update.useMutation({
    onSuccess: async () => {
      await ladderQuery.refetch();
    },
    onError: (err) => onError(err, 'Could not save the step.'),
  });

  const setUnlocked = trpc.exposure.setUnlocked.useMutation({
    onSuccess: async () => {
      await ladderQuery.refetch();
    },
    onError: (err) => onError(err, 'Could not change whether the step is unlocked.'),
  });

  const removeStep = trpc.exposure.remove.useMutation({
    onSuccess: async () => {
      await ladderQuery.refetch();
    },
    onError: (err) => onError(err, 'Could not remove the step.'),
  });

  const steps: LadderStep[] = inLadderOrder(ladderQuery.data?.steps ?? []);
  const unlockedCount = ladderQuery.data?.unlockedCount ?? 0;
  const busy =
    updateStep.isPending || setUnlocked.isPending || removeStep.isPending || addStep.isPending;

  function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const text = label.trim();
    if (!text) {
      setFormError('Write the step.');
      return;
    }
    const value = parseDifficulty(difficulty);
    if (value === null) {
      setFormError('Difficulty is a whole number from 0 to 100.');
      return;
    }
    if (!clientId) return;
    setFormError(null);
    addStep.mutate({ clientUserId: clientId, label: text, difficulty: value });
  }

  /**
   * A move is two writes: the two steps trade positions. Awaiting the first
   * before sending the second keeps a failed write from leaving both at the
   * neighbour's position.
   */
  async function handleMove(step: LadderStep, direction: 'up' | 'down') {
    const index = steps.findIndex((entry) => entry.id === step.id);
    const swap = swapPositions(steps, index, direction);
    if (!swap) return;
    try {
      await updateStep.mutateAsync({ stepId: swap[0].stepId, position: swap[0].position });
      await updateStep.mutateAsync({ stepId: swap[1].stepId, position: swap[1].position });
    } catch {
      // updateStep's onError already put the message on screen.
    }
  }

  function handleSave(step: LadderStep, changes: { label: string; difficulty: number }) {
    updateStep.mutate({ stepId: step.id, ...changes });
  }

  function handleRemove(step: LadderStep) {
    if (
      window.confirm(
        `Remove “${step.label}”?${step.lastRun ? ' The ratings on it go with it.' : ''}`,
      )
    ) {
      removeStep.mutate({ stepId: step.id });
    }
  }

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
            <span className="text-gray-900 font-medium">Exposure ladder</span>
          </div>

          <TabStrip clientId={clientId} active="tools" />

          {/* What this page is */}
          <div className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline border-l-4 border-l-violet">
            <h1 className="text-lg font-semibold text-gray-900">Exposure ladder</h1>
            <p className="mt-2 text-xs text-gray-500 leading-relaxed">
              You build this with {clientLabel}, in session. A step stays hidden from them until
              you unlock it, and you can lock it again at any time. When they run a step, the two
              numbers they gave — before and after — appear here as they gave them.
            </p>
          </div>

          {/* The ladder */}
          <div className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">STEPS</h2>
              {steps.length > 0 && (
                <span className="text-[11px] text-gray-500">
                  {steps.length} step{steps.length === 1 ? '' : 's'} · {unlockedCount} unlocked
                </span>
              )}
            </div>

            <div className="mt-4">
              {ladderQuery.isLoading ? (
                <div
                  className="space-y-3 animate-pulse"
                  role="status"
                  aria-live="polite"
                  aria-busy="true"
                >
                  <span className="sr-only">Loading the ladder…</span>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-20 rounded-lg bg-gray-100" />
                  ))}
                </div>
              ) : ladderQuery.isError ? (
                <p className="text-sm text-danger">
                  Could not load the ladder. Please refresh and try again.
                </p>
              ) : (
                <ExposureLadderList
                  steps={steps}
                  clientLabel={clientLabel}
                  busy={busy}
                  onUnlock={(step) => setUnlocked.mutate({ stepId: step.id, unlocked: true })}
                  onLock={(step) => setUnlocked.mutate({ stepId: step.id, unlocked: false })}
                  onRemove={handleRemove}
                  onMove={handleMove}
                  onSave={handleSave}
                />
              )}
            </div>
          </div>

          {/* Add a step */}
          <div className="rounded-xl bg-oat-elevated p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-hairline">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              ADD A STEP
            </h2>
            <p className="text-xs text-gray-500">
              Added to the end of the ladder, and locked until you unlock it.
            </p>

            <form onSubmit={handleAdd} className="mt-3 space-y-3">
              <label className="block text-xs font-medium text-gray-500">
                The step
                <input
                  value={label}
                  onChange={(event) => {
                    setLabel(event.target.value);
                    if (formError) setFormError(null);
                  }}
                  maxLength={200}
                  placeholder="e.g. say hello to the person at the till"
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet"
                />
              </label>

              <label className="block text-xs font-medium text-gray-500">
                Difficulty, 0 to 100
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={difficulty}
                  onChange={(event) => {
                    setDifficulty(event.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="e.g. 40"
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet sm:w-32"
                />
              </label>

              <button
                type="submit"
                disabled={addStep.isPending}
                className="w-full rounded-lg bg-violet px-4 py-2.5 text-sm font-medium text-white hover:bg-royal-purple transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                {addStep.isPending ? 'Adding...' : 'Add step'}
              </button>
            </form>

            {formError && (
              <p role="alert" className="mt-3 text-sm text-danger">
                {formError}
              </p>
            )}
            {message && (
              <p role="status" className="mt-3 text-sm text-royal-purple">
                {message}
              </p>
            )}
            {errorMessage && (
              <p role="alert" className="mt-3 text-sm text-danger">
                {errorMessage}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
