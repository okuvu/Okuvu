import type { CorpusCase } from '@okuvu/shared-types';

export interface PairedComparisonRow {
  oldCase: CorpusCase;
  newCase: CorpusCase;
  oldOutput?: string;
  newOutput?: string;
}

/**
 * Escape a value for a single CSV field per RFC 4180: wrap in double quotes
 * if it contains a comma, quote, or newline, doubling any embedded quotes.
 */
function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Produce a CSV export of paired old/new CorpusCase comparisons, suitable
 * as input to a McNemar's-test contingency-table analysis done outside this
 * tool. Each row is one paired (old version, new version) comparison.
 *
 * Columns: case_id, old_version, new_version, old_output, new_output
 *
 * `case_id` is the lineage id — the id of the oldest case in the pair
 * (`oldCase.id`), since `newCase` supersedes it and both refer to the same
 * underlying test-case lineage.
 */
export function exportPairedComparisonRows(pairs: PairedComparisonRow[]): string {
  const header = ['case_id', 'old_version', 'new_version', 'old_output', 'new_output'];
  const lines = [header.join(',')];

  for (const pair of pairs) {
    const row = [
      csvField(pair.oldCase.id),
      csvField(String(pair.oldCase.version)),
      csvField(String(pair.newCase.version)),
      csvField(pair.oldOutput ?? ''),
      csvField(pair.newOutput ?? ''),
    ];
    lines.push(row.join(','));
  }

  return lines.join('\r\n');
}
