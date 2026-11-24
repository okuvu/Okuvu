/**
 * The client's own words out of a saved worksheet answer.
 *
 * Used by exactly one place: the Safety card's urgent harm-to-someone flag, where
 * the owner asked to read what the client wrote so he can judge the disclosure
 * himself (24 Nov 2026). No other flag reads content.
 *
 * What it deliberately does NOT do: summarise, reorder by importance, or label
 * anything. The therapist is judging the client's own sentences, so the job is to
 * lay them out in the order they were written and get out of the way. A field id
 * is the one thing added, and only where it helps a therapist find the line again
 * — the paragraphs above it are the client's text verbatim.
 *
 * Answer values are `string | string[] | number | { picked, strength } | rows[]`
 * (packages/shared-types/worksheet.ts). Numbers, option values and strength
 * ratings are skipped: the words are what was asked for, and a wall of
 * `must_do · 7` gets in the way of reading them.
 */

const MAX_CHARS = 6000;

function pushText(value: unknown, depth: number, out: string[]): void {
  if (depth > 6 || value === null || value === undefined) return;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) out.push(trimmed);
    return;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return;
  if (Array.isArray(value)) {
    for (const item of value) pushText(item, depth + 1, out);
    return;
  }
  if (typeof value === 'object') {
    // A row-list answer is an array of { columnId: value }. Walk the values so
    // the client's sentence comes out, not the column name.
    for (const item of Object.values(value as Record<string, unknown>)) {
      pushText(item, depth + 1, out);
    }
  }
}

export function answersToReadableText(answers: unknown): string | null {
  const parts: string[] = [];
  pushText(answers, 0, parts);
  if (parts.length === 0) return null;
  const joined = parts.join('\n\n');
  if (joined.length <= MAX_CHARS) return joined;
  // Never truncate mid-sentence silently: say so, so nobody thinks this is all
  // the client wrote.
  return `${joined.slice(0, MAX_CHARS).trimEnd()}…\n\n(The answer is longer than this card shows.)`;
}
