/**
 * Rated-vs-remaining progress indicator for the review queue.
 *
 * `ratedCount` is tracked client-side as the number of ratings successfully
 * submitted in this session (the server doesn't return a running total),
 * and `remainingCount` is the current length of the local queue (items
 * fetched from `getBlindedItems` that haven't been rated yet).
 */
export default function RaterProgress({
  ratedCount,
  remainingCount,
}: {
  ratedCount: number;
  remainingCount: number;
}) {
  const total = ratedCount + remainingCount;
  const pct = total > 0 ? Math.round((ratedCount / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]">
      <div className="flex items-center justify-between text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
        <span>
          {ratedCount} rated · {remainingCount} remaining
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-[var(--radius-full)] bg-[var(--color-surface-container-high)]">
        <div
          className="h-full rounded-[var(--radius-full)] bg-[var(--color-primary)] transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
