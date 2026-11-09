/**
 * The safety surfaces, pinned.
 *
 * Three things are checked here, and each of them is a drift that would be
 * invisible in a build:
 *
 *   • the helpline list is the five approved services, in the clinical order;
 *   • the demanding-worksheet gate reads a 0-10 rating and closes above 5 or in
 *     a crisis state, failing closed on anything it cannot read;
 *   • the privacy line and the blocked-worksheet copy are the owner's words,
 *     present in the approved document.
 *
 * Run: npx vitest run __tests__/safety-surface.test.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEMANDING_GATE_MESSAGE,
  DEMANDING_GATE_QUESTION,
  DEMANDING_GATE_THRESHOLD,
  HELPLINES,
  PRIVACY_LINE,
  demandingGateBlocks,
} from '../safety';

const DOC = readFileSync(
  join(__dirname, '../../../docs/exercise-library/02-approved-worksheet-copy.md'),
  'utf8',
);

function norm(s: string): string {
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/["*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

describe('the central helpline list', () => {
  it('is the five approved services, in the clinical lead\'s order', () => {
    expect(HELPLINES.map((line) => line.name)).toEqual([
      'Tele-MANAS',
      'Vandrevala Foundation',
      'Emergency services',
      'SNEHA, Chennai',
      'iCall (TISS)',
    ]);
  });

  it('keeps the approved numbers, with dial and display forms agreeing', () => {
    const digits = (s: string) => s.replace(/\D/g, '');
    expect(HELPLINES.map((line) => digits(line.phone))).toEqual([
      '14416',
      '919999666555',
      '112',
      '04424640050',
      '9152987821',
    ]);
    for (const line of HELPLINES) {
      expect(digits(line.display)).toBe(digits(line.phone));
    }
  });

  it('never brings back a service retired by clinical decision', () => {
    const all = HELPLINES.map((l) => `${l.name} ${l.display}`).join(' ');
    expect(all).not.toContain('NIMHANS');
    expect(all).not.toContain('46110007');
    expect(all).not.toContain('1860');
  });

  it('is the same five numbers the app\'s crisis screen dials', () => {
    // The Flutter overlay carries its own copy of the cards; this is the test
    // that stops the two drifting the next time one is edited.
    const dart = readFileSync(
      join(__dirname, '../../../apps/mobile/lib/src/features/crisis/crisis_overlay.dart'),
      'utf8',
    );
    const digits = (s: string) => s.replace(/\D/g, '');
    for (const line of HELPLINES) {
      expect(dart).toContain(digits(line.phone));
    }
  });
});

describe('the demanding-worksheet gate', () => {
  it('closes above 5 out of 10', () => {
    expect(demandingGateBlocks(6, null)).toBe(true);
    expect(demandingGateBlocks(8, null)).toBe(true);
    expect(demandingGateBlocks(10, null)).toBe(true);
  });

  it('opens at 5 and below', () => {
    expect(demandingGateBlocks(5, null)).toBe(false);
    expect(demandingGateBlocks(0, null)).toBe(false);
    expect(DEMANDING_GATE_THRESHOLD).toBe(5);
  });

  it('closes in a crisis state whatever the rating says', () => {
    expect(demandingGateBlocks(1, 'S3')).toBe(true);
    expect(demandingGateBlocks(0, 'S4')).toBe(true);
    expect(demandingGateBlocks(1, 'S2')).toBe(false);
  });

  it('closes when the question was not answered, or the answer is not a rating', () => {
    expect(demandingGateBlocks(null, null)).toBe(true);
    expect(demandingGateBlocks(undefined, null)).toBe(true);
    expect(demandingGateBlocks(Number.NaN, null)).toBe(true);
    expect(demandingGateBlocks(11, null)).toBe(true);
    expect(demandingGateBlocks(3.5, null)).toBe(true);
  });
});

describe('the owner\'s words', () => {
  it('carries the privacy line exactly, and it is the approved sentence', () => {
    expect(norm(DOC)).toContain(norm(PRIVACY_LINE));
    // The promise it replaced is the one thing this line must never say again.
    expect(norm(PRIVACY_LINE)).not.toContain('doesn\'t read');
  });

  it('puts the same privacy sentence on the app\'s journal screen', () => {
    // The app cannot import these constants (it is Dart), so the sentence is a
    // copy there. This is the test that keeps the copy honest: the journal
    // screen's line, quotes and line-wrapping aside, must be the approved one.
    const dart = readFileSync(
      join(__dirname, '../../../apps/mobile/lib/src/features/journal/journal_screen.dart'),
      'utf8',
    );
    expect(norm(dart)).toContain(norm(PRIVACY_LINE));
    // The sentence it replaced promised nobody reads the entry.
    expect(norm(dart)).not.toContain("okuvu doesn't read it");
  });

  it('puts the same privacy sentence on every other surface that makes the promise', () => {
    // Owner's Step 11 check 20: "the journal privacy line is updated
    // everywhere". Journal was pinned; these are the other three, and each one
    // is a hand-copied Dart/TSX string, so each one can drift on its own.
    //
    // The Dart copies are built from adjacent string literals, so the literal
    // quotes sit inside the sentence once the file is read as text. Strip them
    // on both sides before comparing; the words are what is being pinned.
    const loose = (s: string): string => norm(s).replace(/'/g, '').replace(/\s+/g, ' ');
    const surfaces: Array<[string, string]> = [
      [
        'worksheet runner',
        '../../../apps/mobile/lib/src/features/library/worksheet_runner_screen.dart',
      ],
      [
        'Treasure Box',
        '../../../apps/mobile/lib/src/features/library/treasure_box_screen.dart',
      ],
      ['portal privacy page', '../../../apps/therapist-portal/src/app/privacy/page.tsx'],
    ];
    for (const [name, relative] of surfaces) {
      const source = readFileSync(join(__dirname, relative), 'utf8');
      expect(loose(source), `${name} must carry the approved privacy line`).toContain(
        loose(PRIVACY_LINE),
      );
    }
  });

  it('carries the blocked-worksheet message as approved', () => {
    expect(norm(DOC)).toContain(norm(DEMANDING_GATE_MESSAGE));
  });

  it('asks one question before a demanding worksheet', () => {
    expect(norm(DEMANDING_GATE_QUESTION)).toBe(
      norm('How strong is what you\'re feeling right now?'),
    );
  });
});
