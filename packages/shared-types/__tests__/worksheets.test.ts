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
  worksheetRowProblems,
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
    // Fourteen left: the 24 Nov 2026 batch filled four placeholders in — Boundary
    // planner, Unsent letter, Scrolling log (now Doomscroll log) and Pros and cons
    // of change (now Weighing it up) — and kept their ids.
    expect(PLACEHOLDER_CATALOGUE).toHaveLength(14);
    for (const entry of PLACEHOLDER_CATALOGUE) {
      expect(entry.status).toBe('placeholder');
      expect(entry.content_en).toBeNull();
      expect(entry.content_hi).toBeNull();
      expect(entry.summary.length).toBeGreaterThan(0);
      // A placeholder has no wording, so it has no care plan and no deeper screen
      // yet. Both are set with the body, when the worksheet is written.
      expect(entry.care_plans).toEqual([]);
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

/**
 * The Stress & Burnout batch of 24 November 2026.
 *
 * These are DRAFTS: written, validated and previewable, and switched off for
 * clients. The checks below are the rules that can be broken by content alone,
 * so they run on the catalogue rather than on the database.
 */
describe('the Stress & Burnout drafts', () => {
  const drafts = CATALOGUE.filter((entry) => entry.status === 'draft');

  it('is the ten the owner briefed, in the owner\'s order', () => {
    expect(drafts.map((entry) => entry.label)).toEqual([
      "What's on my plate",
      'Basics check',
      'Rest break',
      'Boundary planner',
      'Priority sorter',
      'Doomscroll log',
      'Weekly load check',
      'Unsent letter',
      'Weighing it up',
      'Caring load check',
    ]);
  });

  it('passes the same checks a save runs', () => {
    for (const entry of drafts) {
      expect({ tool: entry.tool_id, problems: worksheetRowProblems(toRegistryRow(entry)) }).toEqual({
        tool: entry.tool_id,
        problems: [],
      });
    }
  });

  it('carries the Stress & Burnout label and nothing else', () => {
    for (const entry of drafts) {
      expect({ tool: entry.tool_id, care_plans: entry.care_plans }).toEqual({
        tool: entry.tool_id,
        care_plans: ['stress_burnout'],
      });
    }
  });

  it('opens only the way the brief says: S for anyone, A through the therapist', () => {
    const brief: Record<string, 'open' | 'assigned'> = {
      ws_whats_on_my_plate: 'open',
      ws_basics_check: 'open',
      ws_rest_break: 'open',
      ws_boundary_planner: 'assigned',
      ws_priority_sorter: 'assigned',
      ws_scrolling_log: 'open',
      ws_weekly_load_check: 'assigned',
      ws_unsent_letter: 'assigned',
      ws_pros_cons_change: 'assigned',
      ws_caring_load_check: 'assigned',
    };
    for (const entry of drafts) {
      expect({ tool: entry.tool_id, access: entry.access_mode }).toEqual({
        tool: entry.tool_id,
        access: brief[entry.tool_id],
      });
    }
  });

  it('gives the deeper screen to the doomscroll log and the unsent letter only', () => {
    expect(drafts.filter((entry) => entry.sensitive_check).map((entry) => entry.tool_id).sort()).toEqual([
      'ws_scrolling_log',
      'ws_unsent_letter',
    ]);
  });

  it('keeps the high-load letter demanding, and everything else light', () => {
    // The only `demanding` draft, because the owner said "High load" for it.
    expect(drafts.filter((entry) => entry.load_level === 'demanding').map((entry) => entry.tool_id)).toEqual([
      'ws_unsent_letter',
    ]);
  });

  it('ships no Hinglish until the English is approved', () => {
    for (const entry of drafts) {
      expect({ tool: entry.tool_id, hi: entry.content_hi, labelHi: entry.label_hi }).toEqual({
        tool: entry.tool_id,
        hi: null,
        labelHi: null,
      });
    }
  });

  it('reads back the keep-or-delete choice only where it exists', () => {
    const withDiscard = drafts.filter((entry) => entry.content_en?.closing?.discardWhen);
    expect(withDiscard.map((entry) => entry.tool_id)).toEqual(['ws_unsent_letter']);
    const discard = withDiscard[0].content_en!.closing!.discardWhen!;
    expect(discard).toEqual({ field: 'keep', in: ['delete'] });
    const choice = withDiscard[0].content_en!.fields.find((field) => field.id === discard.field);
    expect(choice && 'options' in choice ? choice.options.map((o) => o.value) : []).toEqual([
      'keep',
      'delete',
    ]);
  });

  it('uses one slider and no totals anywhere', () => {
    for (const entry of drafts) {
      const text = JSON.stringify(entry.content_en).toLowerCase();
      expect(text).not.toMatch(/total|overall|your score|stress level|burnout level/);
    }
  });
});
