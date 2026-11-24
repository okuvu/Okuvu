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
  buildApprovedDoc,
  buildDraftDoc,
} from '../worksheets/emit-drafts';
import { APPROVED_24_NOV_IDS, draftEntries } from '../worksheets/emit-sql';

const ROOT = join(__dirname, '../../..');
const DRAFT_FILE = join(ROOT, DRAFT_DOC_PATH);
const APPROVED_FILE = join(ROOT, APPROVED_DOC_PATH);

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

  it('says plainly that it is not approved, and covers every remaining draft', () => {
    const doc = buildDraftDoc();
    expect(doc).toContain('NOT approved');
    expect(doc).toContain('switched off for clients');
    for (const entry of draftEntries()) {
      expect(doc).toContain(`\`${entry.tool_id}\``);
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
