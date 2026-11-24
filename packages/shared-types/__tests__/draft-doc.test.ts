/**
 * The draft review document must match the catalogue it was generated from.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DRAFT_DOC_PATH, buildDraftDoc } from '../worksheets/emit-drafts';
import { draftEntries } from '../worksheets/emit-sql';

const ROOT = join(__dirname, '../../..');
const FILE = join(ROOT, DRAFT_DOC_PATH);

describe('draft wording review document', () => {
  it('matches the catalogue', () => {
    const doc = buildDraftDoc();

    if (process.env.WRITE_DRAFT_DOC === '1') {
      mkdirSync(dirname(FILE), { recursive: true });
      writeFileSync(FILE, doc, 'utf8');
      return;
    }

    expect(existsSync(FILE)).toBe(true);
    expect(readFileSync(FILE, 'utf8')).toBe(doc);
  });

  it('says plainly that it is not approved, and covers all ten', () => {
    const doc = buildDraftDoc();
    expect(doc).toContain('NOT approved');
    expect(doc).toContain('switched off for clients');
    for (const entry of draftEntries()) {
      expect(doc).toContain(`\`${entry.tool_id}\``);
    }
  });
});
