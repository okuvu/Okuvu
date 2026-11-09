/**
 * Compare the catalogue's English wording against the approved document.
 *
 * Run: npx vitest run __tests__/worksheets.test.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CATALOGUE,
  LISTABLE_CATALOGUE,
  PLACEHOLDER_CATALOGUE,
  catalogueProblems,
  toRegistryRow,
} from '../worksheets/index';
import {
  stripTherapistCopy,
  toClientWorksheetView,
  validateWorksheetTranslation,
  type WorksheetContent,
} from '../worksheet';

const DOC = readFileSync(
  join(__dirname, '../../../docs/exercise-library/02-approved-worksheet-copy.md'),
  'utf8',
);

/**
 * Normalise for comparison: the document quotes its own copy ("…"), uses curly
 * apostrophes and wraps lines, so a literal comparison would fail on typography
 * rather than on wording.
 */
function norm(s: string): string {
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/["*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

const DOC_NORM = norm(DOC);

function inDoc(s: string): boolean {
  return DOC_NORM.includes(norm(s));
}

/** Every client-facing string in a body, with the path it came from. */
function clientStrings(content: WorksheetContent): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  if (content.intro) out.push({ path: 'intro', text: content.intro });
  content.fields.forEach((field) => {
    const at = field.id;
    out.push({ path: `${at}.prompt`, text: field.prompt });
    if (field.helper) out.push({ path: `${at}.helper`, text: field.helper });
    if (field.example) out.push({ path: `${at}.example`, text: field.example });
    if ('options' in field) {
      field.options.forEach((option) => {
        out.push({ path: `${at}.option.${option.value}.label`, text: option.label });
        if (option.description) {
          out.push({ path: `${at}.option.${option.value}.description`, text: option.description });
        }
      });
    }
  });
  if (content.closing?.text) out.push({ path: 'closing.text', text: content.closing.text });
  content.closing?.buttons?.forEach((b) => out.push({ path: 'closing.button', text: b.label }));
  return out;
}

/**
 * Strings that are structure, not approved copy: the column headings of an
 * add-your-own-rows list, which the document only describes ("Table with two
 * columns") and never quotes. Listed so the exempt set is explicit and can be
 * shown to the clinical lead.
 */
const STRUCTURAL_LABELS = new Set(['What makes it feel true', "What doesn't quite fit"]);

describe('catalogue content', () => {
  it('has sixteen approved Library entries (worksheets 1-16)', () => {
    expect(LISTABLE_CATALOGUE).toHaveLength(16);
  });

  it('validates every approved row with the same checks a save runs', () => {
    expect(catalogueProblems()).toEqual([]);
  });

  it('keeps every placeholder hidden, empty and unapproved', () => {
    expect(PLACEHOLDER_CATALOGUE).toHaveLength(15);
    for (const entry of PLACEHOLDER_CATALOGUE) {
      expect(entry.status).toBe('placeholder');
      expect(entry.content_en).toBeNull();
      expect(entry.content_hi).toBeNull();
      expect(entry.summary.length).toBeGreaterThan(0);
    }
  });

  it('has unique tool ids and unique sort positions', () => {
    const ids = CATALOGUE.map((e) => e.tool_id);
    expect(new Set(ids).size).toBe(ids.length);
    // Ordering is per section: each section restarts its own sequence, and the
    // Library reads section by section.
    const keys = LISTABLE_CATALOGUE.map((e) => `${e.section}:${e.sort_order}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('translates every Hinglish body from its English twin', () => {
    for (const entry of LISTABLE_CATALOGUE) {
      if (!entry.content_en || !entry.content_hi) continue;
      expect({
        tool: entry.tool_id,
        errors: validateWorksheetTranslation(entry.content_en, entry.content_hi),
      }).toEqual({ tool: entry.tool_id, errors: [] });
    }
  });

  it('has no questionnaire, score or diagnosis anywhere a client can see', () => {
    const banned = /phq|gad-?7|gad-?9|questionnaire|diagnos|disorder|symptom|score out/i;
    for (const entry of LISTABLE_CATALOGUE) {
      if (!entry.content_en) continue;
      for (const { path, text } of clientStrings(entry.content_en)) {
        expect({ tool: entry.tool_id, path, banned: banned.test(text) }).toEqual({
          tool: entry.tool_id,
          path,
          banned: false,
        });
      }
      expect(banned.test(entry.label)).toBe(false);
      expect(banned.test(entry.summary)).toBe(false);
    }
  });

  it('uses the approved words, not a paraphrase, for every quoted line', () => {
    const missing: Array<{ tool: string; path: string; text: string }> = [];
    for (const entry of LISTABLE_CATALOGUE) {
      if (!entry.content_en) continue;
      for (const { path, text } of clientStrings(entry.content_en)) {
        if (STRUCTURAL_LABELS.has(text)) continue;
        // A field that quotes several approved examples joins them with " · ".
        const parts = text.split(' · ');
        for (const part of parts) {
          if (!inDoc(part)) missing.push({ tool: entry.tool_id, path, text: part });
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('never sends the therapist framing to a client', () => {
    for (const entry of LISTABLE_CATALOGUE) {
      if (!entry.content_en) continue;
      const view = toClientWorksheetView(toRegistryRow(entry));
      expect(JSON.stringify(view.content)).not.toContain('therapistPrompt');
      const stripped = stripTherapistCopy(entry.content_en);
      expect(stripped).not.toBe(entry.content_en);
      // The lead-in the therapist asks is not in the client's copy.
      expect(JSON.stringify(view.content)).not.toContain('What thoughts, feelings, situations');
    }
  });

  it('keeps every therapist note out of the client view', () => {
    for (const entry of LISTABLE_CATALOGUE) {
      if (!entry.content_en || !entry.therapist_note) continue;
      const view = toClientWorksheetView(toRegistryRow(entry));
      expect(JSON.stringify(view)).not.toContain(entry.therapist_note.slice(0, 40));
    }
  });
});
