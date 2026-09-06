'use client';

import { useEffect, useState } from 'react';
import { trpc } from '@/trpc/client';
import RubricForm from './RubricForm';
import RaterProgress from './RaterProgress';

/**
 * One-at-a-time blinded review queue.
 *
 * Fetches `review.getBlindedItems` once (server has already excluded items
 * this rater has rated and randomized the order per-rater — we never
 * shuffle client-side). The fetched list is copied into local state and
 * items are popped off the front as the rater submits ratings, so the UI
 * always shows exactly one item ("the queue") without needing to refetch
 * (and re-shuffle) after every submission.
 */
export default function ReviewQueue() {
  const { data, isLoading, isError, error } = trpc.review.getBlindedItems.useQuery({});
  const [queue, setQueue] = useState<{ id: string; output: string }[] | null>(null);
  const [ratedCount, setRatedCount] = useState(0);

  // Seed local queue from the server response exactly once per fetch.
  useEffect(() => {
    if (data) {
      setQueue(data);
    }
  }, [data]);

  const handleRated = (itemId: string) => {
    setQueue((prev) => (prev ? prev.filter((item) => item.id !== itemId) : prev));
    setRatedCount((n) => n + 1);
  };

  if (isLoading || queue === null) {
    return (
      <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
        Loading review queue…
      </p>
    );
  }

  if (isError) {
    return (
      <p className="text-[var(--text-body-main)] text-[var(--color-error)]">
        Failed to load review queue: {error?.message ?? 'unknown error'}
      </p>
    );
  }

  const currentItem = queue[0];

  return (
    <div className="flex flex-col gap-[var(--spacing-lg)]">
      <RaterProgress ratedCount={ratedCount} remainingCount={queue.length} />

      {currentItem ? (
        <div className="flex flex-col gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]">
          <h2 className="text-[var(--text-title-sm)] font-[var(--text-title-sm--font-weight)] text-[var(--color-on-surface)]">
            Output to rate
          </h2>
          <p className="whitespace-pre-wrap text-[var(--text-body-main)] text-[var(--color-on-surface)]">
            {currentItem.output}
          </p>
          <RubricForm
            key={currentItem.id}
            itemId={currentItem.id}
            onRated={() => handleRated(currentItem.id)}
          />
        </div>
      ) : (
        <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
          No items left to review. Nice work.
        </p>
      )}
    </div>
  );
}
