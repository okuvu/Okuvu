/**
 * The exposure ladder page's ordering, moving and rating arithmetic.
 *
 * Kept out of the component on purpose: there is no jsdom harness in this app,
 * so logic inside a `.tsx` is logic nothing tests.
 *
 * The two ratings are carried through unchanged. Nothing here subtracts,
 * averages or turns them into a level — `runRatings` hands back the numbers the
 * client chose so the page can show them side by side.
 */

/** One step as `exposure.list` returns it. */
export interface LadderStep {
  id: string;
  label: string;
  difficulty: number;
  position: number;
  unlocked: boolean;
  lastRun: {
    before: number;
    after: number | null;
    createdAt: string;
  } | null;
}

/** The client's own numbers, exactly as stored. */
export interface RunRatings {
  before: number;
  after: number | null;
}

/**
 * The ladder in the order the therapist built it.
 *
 * The query already orders by position, but the page reorders by writing two
 * positions, so it never renders whatever order a refetch happens to produce
 * with two equal positions. Ties keep their incoming order, which is the
 * `created_at` the query used as its tiebreak.
 */
export function inLadderOrder<T extends { position: number }>(steps: T[]): T[] {
  return steps
    .map((step, index) => ({ step, index }))
    .sort((a, b) => a.step.position - b.step.position || a.index - b.index)
    .map((entry) => entry.step);
}

/**
 * The two writes that move one step past its neighbour.
 *
 * `exposure.update` takes a position, not a direction, so a move is the two
 * steps trading positions. Returns null at either end of the ladder, so the
 * caller has nothing to send.
 */
export function swapPositions<T extends { id: string; position: number }>(
  steps: T[],
  index: number,
  direction: 'up' | 'down',
): [{ stepId: string; position: number }, { stepId: string; position: number }] | null {
  const neighbourIndex = direction === 'up' ? index - 1 : index + 1;
  const step = steps[index];
  const neighbour = steps[neighbourIndex];
  if (!step || !neighbour) return null;

  return [
    { stepId: step.id, position: neighbour.position },
    { stepId: neighbour.id, position: step.position },
  ];
}

/** The client's before and after for a step they have run, or null if they have not. */
export function runRatings(step: Pick<LadderStep, 'lastRun'>): RunRatings | null {
  if (!step.lastRun) return null;
  return { before: step.lastRun.before, after: step.lastRun.after };
}

/**
 * A difficulty the therapist typed -> the integer `exposure.add`/`update` accepts.
 *
 * Returns null rather than clamping: a number outside 0-100 is a typo the form
 * should show back, not silently rewrite into a different rating.
 */
export function parseDifficulty(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 0 || value > 100) return null;
  return value;
}
