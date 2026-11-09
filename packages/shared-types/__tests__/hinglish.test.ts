/**
 * The Hinglish review document must match the catalogue it was generated from.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HINGLISH_PATH, buildHinglishDoc } from '../worksheets/emit-hinglish';
import { LISTABLE_CATALOGUE } from '../worksheets/index';

const ROOT = join(__dirname, '../../..');
const FILE = join(ROOT, HINGLISH_PATH);

describe('Hinglish review document', () => {
  it('matches the catalogue', () => {
    const doc = buildHinglishDoc();

    if (process.env.WRITE_HINGLISH_MD === '1') {
      mkdirSync(dirname(FILE), { recursive: true });
      writeFileSync(FILE, doc, 'utf8');
      return;
    }

    expect(existsSync(FILE)).toBe(true);
    expect(readFileSync(FILE, 'utf8')).toBe(doc);
  });

  it('says plainly that it is not approved, and covers every worksheet', () => {
    const doc = buildHinglishDoc();
    expect(doc).toContain('NOT approved');
    expect(doc).toContain('HINGLISH_RELEASED');
    for (const entry of LISTABLE_CATALOGUE) {
      expect(doc).toContain(`\`${entry.tool_id}\``);
    }
  });
});
