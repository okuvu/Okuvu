import { describe, it, expect } from 'vitest';
import {
  parseWorksheetRow,
  worksheetRowProblems,
  type WorksheetRegistryRow,
} from '@okuvu/shared-types/worksheet';
import { LISTABLE_CATALOGUE, PLACEHOLDER_CATALOGUE } from '@okuvu/shared-types/worksheets';

/**
 * The therapist preview's data path, over every approved worksheet.
 *
 * `worksheets.preview` runs `worksheetRowProblems` and then `parseWorksheetRow`
 * for the row it was asked for, and shows the problem list instead of a
 * half-drawn worksheet when either fails. This runs the same two functions over
 * the whole catalogue, so a worksheet that would not open in the portal fails
 * here first.
 */
function row(entry: (typeof LISTABLE_CATALOGUE)[number]): WorksheetRegistryRow {
  return {
    tool_id: entry.tool_id,
    kind:
      entry.opens === 'breathing'
        ? 'group'
        : entry.opens === 'grounding'
          ? 'exercise'
          : 'worksheet',
    status: entry.status,
    label: entry.label,
    summary: entry.summary,
    section: entry.section,
    therapy_modality: entry.therapy_modality,
    access_mode: entry.access_mode,
    load_level: entry.load_level,
    est_minutes: entry.est_minutes,
    content_en: entry.content_en,
    content_hi: entry.content_hi,
  };
}

describe('worksheet preview', () => {
  it('opens every approved worksheet without a single problem', () => {
    const broken = LISTABLE_CATALOGUE.map((entry) => ({
      toolId: entry.tool_id,
      problems: worksheetRowProblems(row(entry)),
    })).filter((result) => result.problems.length > 0);

    expect(broken).toEqual([]);
  });

  it('returns both bodies and a therapist-only note for each one', () => {
    for (const entry of LISTABLE_CATALOGUE) {
      const parsed = parseWorksheetRow(row(entry));
      expect(parsed.english.fields.length).toBeGreaterThan(0);
      expect(parsed.hinglish).not.toBeNull();
      expect(entry.therapist_note).toBeTruthy();
      expect(entry.therapy_modality).toBeTruthy();
    }
  });

  it('keeps the safety plan out of the list of things a client can start', () => {
    const safety = LISTABLE_CATALOGUE.find((entry) => entry.tool_id === 'ws_safety_plan');
    expect(safety?.access_mode).toBe('in_session');
    expect(safety?.opens).toBe('worksheet');
  });

  it('has no placeholder among the previewable rows', () => {
    const listableIds = new Set(LISTABLE_CATALOGUE.map((entry) => entry.tool_id));
    for (const placeholder of PLACEHOLDER_CATALOGUE) {
      expect(listableIds.has(placeholder.tool_id)).toBe(false);
      expect(placeholder.content_en).toBeNull();
    }
  });
});
