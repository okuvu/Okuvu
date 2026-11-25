/**
 * The review documents must match the catalogue they were generated from.
 *
 * Two documents: the drafts still awaiting approval, and the copy the owner
 * approved on 24 Nov 2026. Both are generated so neither can describe a
 * worksheet differently from the app.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APPROVED_DOC_PATH,
  DRAFT_DOC_PATH,
  LOW_MOOD_APPROVED_DOC_PATH,
  LOW_MOOD_DRAFT_DOC_PATH,
  buildApprovedDoc,
  buildDraftDoc,
  buildLowMoodApprovedDoc,
  buildLowMoodDraftDoc,
} from '../worksheets/emit-drafts';
import { APPROVED_24_NOV_IDS, draftEntries } from '../worksheets/emit-sql';
import { LOW_MOOD_BATCH_IDS } from '../worksheets/low-mood';

const ROOT = join(__dirname, '../../..');
const DRAFT_FILE = join(ROOT, DRAFT_DOC_PATH);
const APPROVED_FILE = join(ROOT, APPROVED_DOC_PATH);
const LOW_MOOD_FILE = join(ROOT, LOW_MOOD_DRAFT_DOC_PATH);
const LOW_MOOD_APPROVED_FILE = join(ROOT, LOW_MOOD_APPROVED_DOC_PATH);

const writing = (): boolean => process.env.WRITE_DRAFT_DOC === '1';

function write(path: string, doc: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, doc, 'utf8');
}

describe('draft wording review document', () => {
  it('matches the catalogue', () => {
    const doc = buildDraftDoc();
    if (writing()) {
      write(DRAFT_FILE, doc);
      return;
    }
    expect(existsSync(DRAFT_FILE)).toBe(true);
    expect(readFileSync(DRAFT_FILE, 'utf8')).toBe(doc);
  });

  it('says plainly that it is not approved, and covers every draft it owns', () => {
    const doc = buildDraftDoc();
    expect(doc).toContain('NOT approved');
    // The stress/anxiety handover is complete, so this document now reports
    // nothing waiting. The Low Mood drafts have their own document.
    const earlier = draftEntries().filter((entry) => !LOW_MOOD_BATCH_IDS.includes(entry.tool_id as never));
    expect(earlier).toEqual([]);
    expect(doc).toContain('No worksheet is waiting for approval.');
    for (const id of LOW_MOOD_BATCH_IDS) {
      expect(doc).not.toContain(`\`${id}\``);
    }
  });

  it('leaves the eight approved worksheets out of it', () => {
    const doc = buildDraftDoc();
    for (const id of APPROVED_24_NOV_IDS) {
      expect(doc).not.toContain(`\`${id}\``);
    }
  });
});

describe('approved wording document', () => {
  it('matches the catalogue', () => {
    const doc = buildApprovedDoc();
    if (writing()) {
      write(APPROVED_FILE, doc);
      return;
    }
    expect(existsSync(APPROVED_FILE)).toBe(true);
    expect(readFileSync(APPROVED_FILE, 'utf8')).toBe(doc);
  });

  it('records the ten, the owner’s date, and the revised text of the last two', () => {
    const doc = buildApprovedDoc();
    expect(doc).toContain('24 November 2026');
    for (const id of APPROVED_24_NOV_IDS) {
      expect(doc).toContain(`\`${id}\``);
    }
    // The two revised and then approved the same day are here, with the text
    // that was actually approved rather than the pre-revision wording.
    expect(doc).toContain('`ws_unsent_letter`');
    expect(doc).toContain('`ws_pros_cons_change`');
    expect(doc).toContain('Readiness can change from day to day');
  });
});

describe('Low Mood draft review document', () => {
  it('matches the catalogue', () => {
    const doc = buildLowMoodDraftDoc();
    if (writing()) {
      write(LOW_MOOD_FILE, doc);
      return;
    }
    expect(existsSync(LOW_MOOD_FILE)).toBe(true);
    expect(readFileSync(LOW_MOOD_FILE, 'utf8')).toBe(doc);
  });

  it('reports nothing waiting once all nine are approved', () => {
    const doc = buildLowMoodDraftDoc();
    expect(doc).toContain('No worksheet is waiting for approval.');
    // The nine were approved on 24 Nov 2026, so no row id is left in the draft
    // document — it carries no bodies at all.
    for (const id of LOW_MOOD_BATCH_IDS) {
      expect(doc, id).not.toContain(`\`${id}\``);
    }
  });
});

describe('Low Mood approval document', () => {
  it('matches the catalogue', () => {
    const doc = buildLowMoodApprovedDoc();
    if (writing()) {
      write(LOW_MOOD_APPROVED_FILE, doc);
      return;
    }
    expect(existsSync(LOW_MOOD_APPROVED_FILE)).toBe(true);
    expect(readFileSync(LOW_MOOD_APPROVED_FILE, 'utf8')).toBe(doc);
  });

  it('covers all nine, in the owner’s order, and records the date', () => {
    const doc = buildLowMoodApprovedDoc();
    expect(doc).toContain('24 November 2026');
    let cursor = -1;
    for (const id of LOW_MOOD_BATCH_IDS) {
      const at = doc.indexOf(`\`${id}\``);
      expect(at, id).toBeGreaterThan(-1);
      expect(at, id).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it('shows the four revised lines, not the text they replaced', () => {
    const doc = buildLowMoodApprovedDoc();
    expect(doc).toContain('Sitting outside at sunset');
    expect(doc).not.toContain('Sitting on the terrace at sunset');
    expect(doc).toContain('Who would you like to be back in touch with?');
    expect(doc).not.toContain('Who do you miss?');
    expect(doc).toContain('This is a question therapists often ask.');
    expect(doc).not.toContain('This is an old question and it still works.');
    expect(doc).toContain('Something of my own');
    expect(doc).toContain('What strength would you add?');
  });

  it('shows the two mechanisms in words, so the approval covers them too', () => {
    const doc = buildLowMoodApprovedDoc();
    expect(doc).toContain('Carries over:');
    expect(doc).toContain('ws_small_things');
    expect(doc).toContain('Nothing is saved on the client');
    expect(doc).toContain('Read back:');
    expect(doc).toContain('no score, no average, no ranking of feelings');
  });

  it('never renders the therapist note as client copy', () => {
    const doc = buildLowMoodApprovedDoc();
    expect(doc).not.toContain('Carry the deeper safety screen');
  });
});
