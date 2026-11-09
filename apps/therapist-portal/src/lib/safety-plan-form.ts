import type { WorksheetAnswers, WorksheetField } from '@okuvu/shared-types/worksheet';

/**
 * The safety plan editor's text <-> answers conversion.
 *
 * The editor is a page of textareas, one per part, because a therapist filling
 * this in during a session should be typing, not operating a grid. The stored
 * shape is the catalogue's own `WorksheetAnswers`, so the client's read route
 * and any future renderer read the same object the worksheet model defines.
 *
 * One line per item. A part with two columns ("Name", "Phone") takes
 * `Name, phone` on each line and splits on the last comma — a phone number
 * never contains one, and a name that does stays intact up to its final comma.
 *
 * Kept out of the component on purpose: there is no jsdom harness in this app,
 * so logic inside a `.tsx` is logic nothing tests.
 */

const COLUMN_SPLIT = /,(?=[^,]*$)/;

export function partsOf(content: { fields: WorksheetField[] }): WorksheetField[] {
  return content.fields;
}

/** Answers -> the textarea text the therapist edits. Empty answers give ''. */
export function answersToDraft(fields: WorksheetField[], answers: WorksheetAnswers): Record<string, string> {
  const drafts: Record<string, string> = {};

  for (const field of fields) {
    if (field.type === 'instruction') continue;
    const value = answers[field.id];

    if (value === undefined || value === null) {
      drafts[field.id] = '';
      continue;
    }

    if (Array.isArray(value)) {
      const columns = 'columns' in field && field.columns ? field.columns.map((c) => c.id) : [];
      drafts[field.id] = value
        .map((row) => {
          if (typeof row === 'string') return row;
          if (typeof row === 'number') return String(row);
          const cells = columns.length > 0 ? columns : Object.keys(row as Record<string, unknown>);
          return cells.map((key) => String((row as Record<string, unknown>)[key] ?? '')).join(', ');
        })
        .filter((line) => line.trim().length > 0)
        .join('\n');
      continue;
    }

    drafts[field.id] = String(value);
  }

  return drafts;
}

/**
 * The textarea text -> stored answers.
 *
 * Blank lines are dropped rather than stored as empty rows, and a part the
 * therapist left alone is omitted entirely, so "no answer" stays absent instead
 * of becoming "".
 */
export function draftToAnswers(fields: WorksheetField[], drafts: Record<string, string>): WorksheetAnswers {
  const answers: WorksheetAnswers = {};

  for (const field of fields) {
    if (field.type === 'instruction') continue;
    const raw = drafts[field.id];
    const lines = (raw ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) continue;

    if (field.type === 'row_list') {
      const columns = field.columns.map((c) => c.id);
      if (columns.length === 1) {
        answers[field.id] = lines.map((line) => ({ [columns[0]]: line }));
      } else {
        answers[field.id] = lines.map((line) => {
          const parts = line.split(COLUMN_SPLIT).map((part) => part.trim());
          const row: Record<string, string> = {};
          columns.forEach((column, index) => {
            row[column] = parts[index] ?? '';
          });
          return row;
        });
      }
      continue;
    }

    if (field.type === 'short_text' || field.type === 'long_text' || field.type === 'choice') {
      answers[field.id] = field.type === 'choice' ? lines[0] : lines.join('\n');
      continue;
    }

    // Any other type is not used by the safety plan; storing the raw text
    // under its key would be a shape the client renderer cannot read.
  }

  return answers;
}

/** True when the answers hold at least one non-empty part. */
export function hasContent(answers: WorksheetAnswers): boolean {
  return Object.values(answers).some((value) => {
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== undefined;
  });
}
