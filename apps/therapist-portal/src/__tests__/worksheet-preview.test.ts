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

  it('returns an English body and a therapist-only note for each one', () => {
    for (const entry of LISTABLE_CATALOGUE) {
      const parsed = parseWorksheetRow(row(entry));
      expect(parsed.english.fields.length).toBeGreaterThan(0);
      expect(entry.therapist_note).toBeTruthy();
      expect(entry.therapy_modality).toBeTruthy();
    }
  });

  it('has no Hinglish for the rows approved after 9 Nov, only the original sixteen', () => {
    // Every approval after 9 Nov was English-only: the Hinglish gate is released
    // per row after review, so a newly approved worksheet must not arrive with a
    // translation nobody has read. The translations are the owner's to approve
    // separately (his instruction, 24 Nov 2026: "noted for later"), so this list
    // grows with every English-only batch: nineteen after Stress & Burnout and
    // Anxiety & Worry, twenty-eight once the nine Low Mood rows were approved, and
    // thirty-two once the four All extras were switched on on 26 Nov 2026.
    const withoutHinglish = LISTABLE_CATALOGUE.filter(
      (entry) => parseWorksheetRow(row(entry)).hinglish === null,
    ).map((entry) => entry.tool_id);
    expect(withoutHinglish.sort()).toEqual([
      'ws_basics_check',
      'ws_body_map',
      'ws_boundary_planner',
      'ws_brain_dump',
      'ws_caring_load_check',
      'ws_comparison_check',
      'ws_exam_career_pressure',
      'ws_exposure_ladder',
      'ws_family_expectations',
      'ws_inner_critic',
      'ws_miracle_question',
      'ws_mood_activity_log',
      'ws_muscle_relaxation',
      'ws_one_small_thing',
      'ws_priority_sorter',
      'ws_pros_cons_change',
      'ws_reconnect_planner',
      'ws_rest_break',
      'ws_safe_place',
      'ws_scrolling_log',
      'ws_sitting_with_not_knowing',
      'ws_sleep_diary',
      'ws_social_situation_prep',
      'ws_sos_calm',
      'ws_strengths',
      'ws_things_i_might_enjoy',
      'ws_tiny_steps',
      'ws_unhooking',
      'ws_unsent_letter',
      'ws_weekly_load_check',
      'ws_whats_on_my_plate',
      'ws_worry_time',
    ]);
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

  /**
   * The preview renders the read-back and the hand-off button from the parsed
   * content, not from a hard-coded list, so both have to survive validation and
   * name the fields they read. If either is dropped here, the therapist previews
   * a worksheet that is missing a piece the client will see.
   */
  it('carries the weekly read-back through to the preview', () => {
    const log = LISTABLE_CATALOGUE.find((entry) => entry.tool_id === 'ws_mood_activity_log');
    expect(log).toBeTruthy();
    const parsed = parseWorksheetRow(row(log!));
    const review = parsed.english.review;
    expect(review).toBeTruthy();
    expect(review!.withinDays).toBe(7);
    // Both named pieces exist earlier in the same body, with the right types.
    const ids = parsed.english.fields.map((field) => field.id);
    expect(ids).toContain(review!.activityField);
    expect(ids).toContain(review!.feelingsField);
    const activity = parsed.english.fields.find((field) => field.id === review!.activityField);
    const feelings = parsed.english.fields.find((field) => field.id === review!.feelingsField);
    expect(activity?.type).toBe('short_text');
    expect(feelings?.type).toBe('feelings_picker');
  });

  it('carries the hand-off button through to the preview, pointing somewhere real', () => {
    const enjoy = LISTABLE_CATALOGUE.find((entry) => entry.tool_id === 'ws_things_i_might_enjoy');
    expect(enjoy).toBeTruthy();
    const parsed = parseWorksheetRow(row(enjoy!));
    const handOff = parsed.english.closing?.handOff;
    expect(handOff).toBeTruthy();
    expect(handOff!.label).toBe('Take these to my Small things planner');
    // The target worksheet exists and has the column the picks land in, so the
    // button can never point at nothing.
    const target = LISTABLE_CATALOGUE.find((entry) => entry.tool_id === handOff!.toolId);
    expect(target).toBeTruthy();
    const targetParsed = parseWorksheetRow(row(target!));
    const targetField = targetParsed.english.fields.find((field) => field.id === handOff!.targetField);
    if (targetField?.type !== 'row_list') throw new Error('the hand-off target must be a list');
    expect(targetField.columns.some((column) => column.id === handOff!.targetColumn)).toBe(true);
  });
});
