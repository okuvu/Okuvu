'use client';

import { useState } from 'react';
import { parseDifficulty, runRatings, type LadderStep } from '@/lib/exposure-ladder';

/**
 * The ladder itself: one row per step, top to bottom, in the order the therapist
 * built it.
 *
 * Presentational on purpose — the page owns the tRPC calls, so this file can be
 * rendered from a test with plain props (there is no jsdom harness in this app).
 *
 * The client's before and after are rendered as the two numbers they chose, next
 * to each other. Nothing here subtracts them, sums them or turns them into a
 * level, and a step the client has not run yet says so rather than showing 0.
 */
export interface ExposureLadderListProps {
  steps: LadderStep[];
  clientLabel: string;
  busy?: boolean;
  onUnlock: (step: LadderStep) => void;
  onLock: (step: LadderStep) => void;
  onRemove: (step: LadderStep) => void;
  onMove: (step: LadderStep, direction: 'up' | 'down') => void;
  onSave: (step: LadderStep, changes: { label: string; difficulty: number }) => void;
}

export function ExposureLadderList({
  steps,
  clientLabel,
  busy = false,
  onUnlock,
  onLock,
  onRemove,
  onMove,
  onSave,
}: ExposureLadderListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftDifficulty, setDraftDifficulty] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  function startEdit(step: LadderStep) {
    setEditingId(step.id);
    setDraftLabel(step.label);
    setDraftDifficulty(String(step.difficulty));
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  function submitEdit(event: React.FormEvent, step: LadderStep) {
    event.preventDefault();
    const label = draftLabel.trim();
    if (!label) {
      setEditError('A step needs a few words.');
      return;
    }
    const difficulty = parseDifficulty(draftDifficulty);
    if (difficulty === null) {
      setEditError('Difficulty is a whole number from 0 to 100.');
      return;
    }
    setEditError(null);
    setEditingId(null);
    onSave(step, { label, difficulty });
  }

  if (steps.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm italic text-gray-500">No steps yet.</p>
        <p className="mt-1 text-xs text-gray-500">
          Add the first one below — it stays locked until you unlock it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {steps.map((step, index) => {
        const ratings = runRatings(step);
        const locked = !step.unlocked;
        const isEditing = editingId === step.id;

        return (
          <div
            key={step.id}
            data-testid="ladder-step"
            data-locked={locked ? 'true' : 'false'}
            className={`rounded-lg border border-hairline border-l-4 bg-gray-50 px-3 py-3 ${
              locked ? 'border-l-honey' : 'border-l-sage'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                <span
                  data-testid="step-number"
                  className="mt-0.5 w-5 shrink-0 text-xs tabular-nums text-gray-400"
                >
                  {index + 1}.
                </span>
                <div className="min-w-0">
                  <p data-testid="step-label" className="text-sm text-gray-900">
                    {step.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    Difficulty {step.difficulty} of 100
                  </p>
                </div>
              </div>

              <span
                data-testid="lock-state"
                className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  locked ? 'bg-honey-tint text-honey-deep' : 'bg-sage-tint text-sage-deep'
                }`}
              >
                {locked ? 'Locked' : 'Unlocked for them'}
              </span>
            </div>

            {locked && (
              <p className="mt-2 pl-7 text-[11px] text-gray-600">
                {clientLabel} cannot see this step yet.
              </p>
            )}

            {ratings ? (
              <div className="mt-2 pl-7">
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm text-gray-900">
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
                      Before
                    </span>
                    <span data-testid="rating-before" className="tabular-nums">
                      {ratings.before}
                    </span>
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
                      After
                    </span>
                    <span data-testid="rating-after" className="tabular-nums">
                      {ratings.after === null ? 'Not yet' : ratings.after}
                    </span>
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  {ratings.after === null
                    ? 'Their before rating, as they gave it. The after one is still to come.'
                    : 'Their own ratings, as they gave them.'}
                </p>
              </div>
            ) : (
              <p className="mt-2 pl-7 text-[11px] text-gray-400">
                {clientLabel} has not run this step yet.
              </p>
            )}

            {isEditing ? (
              <form
                onSubmit={(event) => submitEdit(event, step)}
                className="mt-3 space-y-2 rounded-lg border border-hairline bg-oat-elevated p-3"
              >
                <label className="block text-[11px] font-medium text-gray-500">
                  The step
                  <input
                    value={draftLabel}
                    onChange={(event) => setDraftLabel(event.target.value)}
                    maxLength={200}
                    aria-label={`Step ${index + 1}`}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  />
                </label>
                <label className="block text-[11px] font-medium text-gray-500">
                  Difficulty (0-100)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={draftDifficulty}
                    onChange={(event) => setDraftDifficulty(event.target.value)}
                    aria-label={`Difficulty for step ${index + 1}`}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  />
                </label>
                {editError && (
                  <p role="alert" className="text-[11px] text-danger">
                    {editError}
                  </p>
                )}
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-lg bg-violet px-3 py-1.5 text-xs font-medium text-white hover:bg-royal-purple disabled:opacity-60"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="text-xs text-gray-600 hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-7 text-[11px]">
                {locked ? (
                  <button
                    type="button"
                    onClick={() => onUnlock(step)}
                    disabled={busy}
                    className="font-medium text-royal-purple hover:underline disabled:opacity-60"
                  >
                    Unlock for them
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onLock(step)}
                    disabled={busy}
                    className="font-medium text-royal-purple hover:underline disabled:opacity-60"
                  >
                    Lock again
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => startEdit(step)}
                  disabled={busy}
                  className="text-gray-600 hover:underline disabled:opacity-60"
                >
                  Edit
                </button>
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => onMove(step, 'up')}
                    disabled={busy}
                    className="text-gray-600 hover:underline disabled:opacity-60"
                  >
                    Move up
                  </button>
                )}
                {index < steps.length - 1 && (
                  <button
                    type="button"
                    onClick={() => onMove(step, 'down')}
                    disabled={busy}
                    className="text-gray-600 hover:underline disabled:opacity-60"
                  >
                    Move down
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(step)}
                  disabled={busy}
                  className="text-danger hover:underline disabled:opacity-60"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
