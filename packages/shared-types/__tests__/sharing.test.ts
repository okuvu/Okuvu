/**
 * Sharing copy, pinned to the approved document.
 *
 * The share labels and the two confirmation sentences are promises, and a
 * paraphrase in one screen is a different promise. This test fails the build
 * if the constants in `sharing.ts` stop being the owner's words.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FIRST_SHARE_BUTTONS,
  FIRST_SHARE_LINE,
  SHAREABLE_KINDS,
  SHARE_LABEL_PRIVATE,
  SHARE_LABEL_SHARED,
  UPDATES_SHARED_LINE,
  WORKSHEET_SHARE_BUTTONS,
  WORKSHEET_SHARE_PROMPT,
  isVisibleToTherapist,
  shareLabel,
} from '../sharing';

const DOC = readFileSync(
  join(__dirname, '../../../docs/exercise-library/02-approved-worksheet-copy.md'),
  'utf8',
);

function norm(s: string): string {
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

describe('sharing copy is the approved copy', () => {
  it('has exactly two labels, and they are the document’s', () => {
    expect(SHARE_LABEL_PRIVATE).toBe('Private');
    expect(SHARE_LABEL_SHARED).toBe('Shared with my therapist');
    expect(norm(DOC)).toContain(norm('"Private" or "Shared with my therapist"'));
    expect(shareLabel(true)).toBe(SHARE_LABEL_SHARED);
    expect(shareLabel(false)).toBe(SHARE_LABEL_PRIVATE);
  });

  it('uses the approved first-share sentence and buttons', () => {
    expect(norm(DOC)).toContain(norm(FIRST_SHARE_LINE));
    expect(FIRST_SHARE_BUTTONS).toEqual({ confirm: 'Share', cancel: 'Cancel' });
  });

  it('uses the approved assigned-worksheet question and equal buttons', () => {
    expect(norm(DOC)).toContain(norm(WORKSHEET_SHARE_PROMPT));
    expect(WORKSHEET_SHARE_BUTTONS).toEqual({ share: 'Share', keepPrivate: 'Keep private' });
  });

  it('carries the fixed Updates line about reading before sessions', () => {
    expect(norm(DOC)).toContain(norm(UPDATES_SHARED_LINE));
  });

  it('knows exactly the three shareable surfaces', () => {
    expect([...SHAREABLE_KINDS]).toEqual([
      'journal_entry',
      'worksheet_response',
      'treasure_note',
    ]);
  });

  it('treats only an explicit true as visible, so a missing flag is private', () => {
    expect(isVisibleToTherapist(true)).toBe(true);
    expect(isVisibleToTherapist(false)).toBe(false);
    expect(isVisibleToTherapist(null)).toBe(false);
    expect(isVisibleToTherapist(undefined)).toBe(false);
  });
});
