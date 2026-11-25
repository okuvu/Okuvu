/**
 * The Anxiety & Worry batch, and the one new piece it needed.
 *
 * These are draft rows: nothing here is approved wording, so the assertions are
 * about the properties the owner's Step 0 rules fix — the label, the safety
 * screen, the refusal cases — not about the sentences themselves.
 */
import { describe, expect, it } from 'vitest';
import {
  validateWorksheetAnswers,
  validateWorksheetContent,
  worksheetRequestProblems,
} from '../worksheet';
import { CATALOGUE, LISTABLE_CATALOGUE, entryById } from '../worksheets';
import { ANXIETY_DRAFT_BATCH_IDS } from '../worksheets/emit-sql';

const IDS = [...ANXIETY_DRAFT_BATCH_IDS];

describe('the Anxiety & Worry batch', () => {
  it('is nine rows, all draft, all labelled for the anxiety plan', () => {
    expect(IDS).toHaveLength(9);
    for (const id of IDS) {
      const row = entryById(id);
      expect(row, id).toBeTruthy();
      expect(row!.status).toBe('draft');
      expect(row!.care_plans).toEqual(['anxiety_worry']);
      expect(row!.content_en).not.toBeNull();
    }
  });

  it('is invisible to clients: not one of the nine is listable', () => {
    const listable = LISTABLE_CATALOGUE.map((row) => row.tool_id);
    for (const id of IDS) expect(listable).not.toContain(id);
  });

  it('carries the shared safety check only: none of these is on the deeper-screen list', () => {
    // The owner named five worksheets for the wider keyword floor — Comparison
    // check, Sleep diary, Meet the inner critic, Unsent letter, Doomscroll log.
    // None of them is in this batch, so a row here claiming the deeper screen
    // would be either a copy of the mechanism or a mistake.
    const sensitive = CATALOGUE.filter((row) => row.sensitive_check).map((row) => row.tool_id).sort();
    expect(sensitive).toEqual([
      'ws_comparison_check',
      'ws_inner_critic',
      'ws_scrolling_log',
      'ws_sleep_diary',
      'ws_unsent_letter',
    ]);
    for (const id of IDS) expect(entryById(id)!.sensitive_check).toBe(false);
  });

  it('never asks for weight, measurements, calories, food amounts or medicines', () => {
    for (const id of IDS) {
      expect({ id, problems: worksheetRequestProblems(entryById(id)!.content_en) }).toEqual({
        id,
        problems: [],
      });
    }
  });

  it('keeps the exposure ladder out of reach of every client path', () => {
    const ladder = entryById('ws_exposure_ladder')!;
    expect(ladder.access_mode).toBe('therapist_only');
    expect(ladder.load_level).toBe('demanding');
    // A therapist-only row is not a Library card and is not assignable: the two
    // are the same fact, so both are asserted here rather than trusted.
    expect(LISTABLE_CATALOGUE.map((row) => row.tool_id)).not.toContain('ws_exposure_ladder');
  });

  it('gives the four S worksheets open access and the four A worksheets assignment', () => {
    const modes = Object.fromEntries(
      IDS.map((id) => [id, entryById(id)!.access_mode]),
    );
    expect(modes).toMatchObject({
      ws_brain_dump: 'open',
      ws_sos_calm: 'open',
      ws_exam_career_pressure: 'open',
      ws_worry_time: 'assigned',
      ws_unhooking: 'assigned',
      ws_sitting_with_not_knowing: 'assigned',
      ws_social_situation_prep: 'assigned',
      ws_family_expectations: 'assigned',
      ws_exposure_ladder: 'therapist_only',
    });
  });
});

describe('the echo piece', () => {
  const base = (over: Record<string, unknown> = {}): unknown => ({
    version: 1,
    fields: [
      { id: 'thought', type: 'short_text', prompt: 'The thought?' },
      {
        id: 'readback',
        type: 'echo',
        prompt: 'Read it back.',
        fromField: 'thought',
        frames: ["I'm having the thought that {answer}"],
        ...over,
      },
    ],
  });

  it('accepts a frame that carries the client’s words', () => {
    expect(validateWorksheetContent(base())).toMatchObject({ ok: true });
  });

  it('refuses a frame with nowhere to put the answer', () => {
    const result = validateWorksheetContent(base({ frames: ['A thought is not a fact.'] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain('must contain {answer}');
  });

  it('refuses a read-back of something the client has not written', () => {
    const result = validateWorksheetContent(base({ fromField: 'later' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain('is not an earlier piece');
  });

  it('refuses a read-back of a slider, because there are no words to show', () => {
    const result = validateWorksheetContent({
      version: 1,
      fields: [
        { id: 'score', type: 'scale_0_10', prompt: 'How much?' },
        { id: 'readback', type: 'echo', prompt: 'Read it back.', fromField: 'score', frames: ['{answer}'] },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain('must be a text piece');
  });

  it('is never required and never answerable', () => {
    expect(validateWorksheetContent(base({ required: true }))).toMatchObject({ ok: false });
    const content = {
      version: 1 as const,
      fields: [
        { id: 'thought' as const, type: 'short_text' as const, prompt: 'The thought?' },
        {
          id: 'readback' as const,
          type: 'echo' as const,
          prompt: 'Read it back.',
          fromField: 'thought',
          frames: ["I'm having the thought that {answer}"],
        },
      ],
    };
    expect(validateWorksheetAnswers(content, { thought: 'I will fail', readback: 'anything' })).toContain(
      'readback: this piece does not take an answer',
    );
  });
});
