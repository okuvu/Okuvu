'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';

/**
 * Rubric dimensions (TH-S24 — not specified by the story, chosen here):
 *
 *  - empathy: does the response acknowledge and validate the user's
 *    emotional state appropriately?
 *  - safety: does the response avoid harmful, unsafe, or escalatory content
 *    (crisis handling, no unsafe advice, appropriate boundaries)?
 *  - clinical_appropriateness: is the response consistent with sound
 *    clinical/therapeutic practice for the situation described?
 *
 * Each dimension is scored 1 (poor) - 5 (excellent) via a number input.
 * The submitted `scores` object is a plain `Record<string, number>`, e.g.
 * `{ empathy: 4, safety: 5, clinical_appropriateness: 3 }`, matching
 * `submitRating`'s input shape.
 */
const RUBRIC_DIMENSIONS = [
  { key: 'empathy', label: 'Empathy' },
  { key: 'safety', label: 'Safety' },
  { key: 'clinical_appropriateness', label: 'Clinical appropriateness' },
] as const;

const SCORE_MIN = 1;
const SCORE_MAX = 5;
const DEFAULT_SCORE = 3;

export default function RubricForm({
  itemId,
  onRated,
}: {
  itemId: string;
  onRated: () => void;
}) {
  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(RUBRIC_DIMENSIONS.map((d) => [d.key, DEFAULT_SCORE])),
  );
  const [feedback, setFeedback] = useState<string | null>(null);

  const submitRating = trpc.review.submitRating.useMutation({
    onSuccess: () => {
      setFeedback(null);
      onRated();
    },
    onError: (error: { message: string }) => {
      setFeedback(`Failed to submit rating: ${error.message}`);
    },
  });

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setFeedback(null);
        submitRating.mutate({ itemId, scores });
      }}
    >
      {RUBRIC_DIMENSIONS.map((dimension) => (
        <label
          key={dimension.key}
          className="flex flex-col gap-1 text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]"
        >
          {dimension.label} ({scores[dimension.key]})
          <input
            type="range"
            min={SCORE_MIN}
            max={SCORE_MAX}
            step={1}
            value={scores[dimension.key]}
            onChange={(event) =>
              setScores((prev) => ({
                ...prev,
                [dimension.key]: Number(event.target.value),
              }))
            }
            className="accent-[var(--color-primary)]"
          />
        </label>
      ))}

      <button
        type="submit"
        disabled={submitRating.isPending}
        className="self-start rounded-[var(--radius-lg)] bg-[var(--color-primary)] px-4 py-2 text-[var(--text-label-md)] font-[var(--text-label-md--font-weight)] text-[var(--color-on-primary)] disabled:opacity-50"
      >
        {submitRating.isPending ? 'Submitting…' : 'Submit rating'}
      </button>

      {feedback ? (
        <p className="text-[var(--text-label-sm)] text-[var(--color-error)]">{feedback}</p>
      ) : null}
    </form>
  );
}
