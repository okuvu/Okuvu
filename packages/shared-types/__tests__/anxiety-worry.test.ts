/**
 * The Anxiety & Worry batch, and the one new piece it needed.
 *
 * The batch was approved on 24 November 2026 — six as written, four after the
 * revisions the owner asked for — so the assertions here are about the
 * properties his Step 0 rules fix (the label, the safety screen, the read-back
 * that cannot skip its check, the refusal cases) and about the state of the
 * batch, not about re-deciding the sentences in a test.
 */
import { describe, expect, it } from 'vitest';
import {
  validateWorksheetAnswers,
  validateWorksheetContent,
  worksheetRequestProblems,
} from '../worksheet';
import { CATALOGUE, CLIENT_LIBRARY_CATALOGUE, LISTABLE_CATALOGUE, entryById } from '../worksheets';
import { ANXIETY_DRAFT_BATCH_IDS } from '../worksheets/emit-sql';
import { WORRY_REMINDER_COPY_APPROVED, WORRY_REMINDER_EMAIL } from '../worksheets/anxiety-worry';

const IDS = [...ANXIETY_DRAFT_BATCH_IDS];

describe('the Anxiety & Worry batch', () => {
  it('is nine rows, all approved on 24 Nov, all labelled for the anxiety plan', () => {
    expect(IDS).toHaveLength(9);
    for (const id of IDS) {
      const row = entryById(id);
      expect(row, id).toBeTruthy();
      expect(row!.status).toBe('approved');
      expect(row!.approved_at).toBe('2026-11-24');
      expect(row!.care_plans).toEqual(['anxiety_worry']);
      expect(row!.content_en).not.toBeNull();
    }
  });

  it('puts the eight client rows in the Library and keeps the ladder therapist-only', () => {
    // Approval is not publication. The catalogue lists the ladder because it is
    // approved, and its access_mode is what keeps it out of the client Library —
    // the api's list query filters `therapist_only`, so no card and no
    // assignment can find it.
    const listable = LISTABLE_CATALOGUE.map((row) => row.tool_id);
    for (const id of IDS) {
      if (id === 'ws_exposure_ladder') continue;
      expect(listable, id).toContain(id);
    }
    expect(entryById('ws_exposure_ladder')!.access_mode).toBe('therapist_only');
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
    // Approved, so the catalogue lists it; therapist-only, so the client Library
    // does not, and no query can put it in front of a client.
    expect(LISTABLE_CATALOGUE.map((row) => row.tool_id)).toContain('ws_exposure_ladder');
    expect(CLIENT_LIBRARY_CATALOGUE.map((row) => row.tool_id)).not.toContain('ws_exposure_ladder');
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
        screened: true,
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
        { id: 'readback', type: 'echo', prompt: 'Read it back.', fromField: 'score', frames: ['{answer}'], screened: true },
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
          screened: true as const,
        },
      ],
    };
    expect(validateWorksheetAnswers(content, { thought: 'I will fail', readback: 'anything' })).toContain(
      'readback: this piece does not take an answer',
    );
  });
});

describe('the read-back cannot skip its check', () => {
  const withEcho = (over: Record<string, unknown>): unknown => ({
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

  it('refuses an echo piece that does not declare itself screened', () => {
    // The owner's decision (24 Nov 2026): the thought is safety-checked before
    // the read-back is drawn, and a flagged thought is never shown inside the
    // frame. A piece that does not say it is screened is not a piece the app can
    // draw, so it is refused at the copy level rather than at the screen.
    const result = validateWorksheetContent(withEcho({}));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain('must be screened before it is shown');
  });

  it('refuses screened: false as well, because there is no safe unscreened form', () => {
    const result = validateWorksheetContent(withEcho({ screened: false }));
    expect(result.ok).toBe(false);
  });

  it('accepts the only value there is', () => {
    expect(validateWorksheetContent(withEcho({ screened: true }))).toMatchObject({ ok: true });
  });
});

describe('the worry-time reminder wording', () => {
  it('is not approved, so nothing may send it', () => {
    // A single switch, read by the sender and by the caller. It flips only in
    // the change that records the owner's approval.
    expect(WORRY_REMINDER_COPY_APPROVED).toBe(false);
  });

  it('names nothing in the subject or the preview line', () => {
    // The owner's constraint: a family member may see this on a shared phone.
    // The subject and the preview are the two lines that can show outside the
    // app, so neither may contain any of these words.
    const forbidden = ['worry', 'worries', 'anxiety', 'anxious', 'mental', 'therapy', 'therapist'];
    for (const line of [WORRY_REMINDER_EMAIL.subject, WORRY_REMINDER_EMAIL.preview]) {
      const lower = line.toLowerCase();
      for (const word of forbidden) expect(lower, `${line} contains "${word}"`).not.toContain(word);
    }
  });

  it('keeps the neutral subject the owner asked for', () => {
    expect(WORRY_REMINDER_EMAIL.subject).toBe('A reminder from OKUVU');
  });

  it('does not name the worksheet in the body either', () => {
    expect(WORRY_REMINDER_EMAIL.body.toLowerCase()).not.toContain('worry time');
  });
});
