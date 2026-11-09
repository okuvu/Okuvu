import { describe, expect, it } from 'vitest';
import {
  isFieldVisible,
  missingRequiredFields,
  validateWorksheetAnswers,
  validateWorksheetContent,
  validateWorksheetTranslation,
  visibleFields,
  worksheetProgress,
  type WorksheetContent,
} from '../worksheet';

/**
 * A small valid worksheet used by most tests. The prompts are placeholders on
 * purpose: this file tests the machinery, not the approved wording, so it must
 * never become a second copy of the clinical document.
 */
function sample(): Record<string, unknown> {
  return {
    version: 1,
    intro: 'Intro copy.',
    fields: [
      { id: 'what_happened', type: 'instruction', prompt: 'A moment from this week.' },
      { id: 'facts', type: 'short_text', prompt: 'What happened?', required: true, helper: 'Just the facts.' },
      {
        id: 'can_act',
        type: 'choice',
        prompt: 'Is there anything you can do about it?',
        required: true,
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'not_now', label: 'Not right now' },
        ],
      },
      {
        id: 'first_step',
        type: 'short_text',
        prompt: 'What is one small step?',
        visibleWhen: { field: 'can_act', in: ['yes'] },
      },
      {
        id: 'park_it',
        type: 'datetime',
        prompt: 'When is your worry time?',
        withDate: true,
        withTime: true,
        visibleWhen: { field: 'can_act', in: ['not_now'] },
      },
      { id: 'closing', type: 'closing_reflection', prompt: 'What do you notice now?' },
    ],
    closing: { text: 'Done.', buttons: [{ label: 'Done', action: 'done' }] },
  };
}

describe('validateWorksheetContent', () => {
  it('accepts a well-formed worksheet and returns it typed', () => {
    const result = validateWorksheetContent(sample());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.fields).toHaveLength(6);
      expect(result.content.version).toBe(1);
    }
  });

  it('rejects a non-object', () => {
    const result = validateWorksheetContent('nope');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/must be an object/);
  });

  it('rejects an empty worksheet', () => {
    const bad = { ...sample(), fields: [] };
    const result = validateWorksheetContent(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/at least one piece/);
  });

  it('rejects a wrong content version', () => {
    const bad = { ...sample(), version: 2 };
    const result = validateWorksheetContent(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/version/);
  });

  it('rejects an unknown piece type', () => {
    const bad = sample();
    (bad.fields as unknown[]).push({ id: 'phq', type: 'phq9', prompt: 'Feeling down?' });
    const result = validateWorksheetContent(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/unknown piece type/);
  });

  it('rejects an unknown key, so a typo cannot silently relax a rule', () => {
    const bad = sample();
    (bad.fields as Array<Record<string, unknown>>)[1].requried = true;
    const result = validateWorksheetContent(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/unknown key "requried"/);
  });

  it('rejects duplicate piece ids', () => {
    const bad = sample();
    (bad.fields as Array<Record<string, unknown>>)[2].id = 'facts';
    const result = validateWorksheetContent(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/duplicate id/);
  });

  it('requires a prompt on every piece', () => {
    const bad = sample();
    delete (bad.fields as Array<Record<string, unknown>>)[1].prompt;
    const result = validateWorksheetContent(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/prompt: required/);
  });

  it('rejects an instruction marked required', () => {
    const bad = sample();
    (bad.fields as Array<Record<string, unknown>>)[0].required = true;
    const result = validateWorksheetContent(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/never required/);
  });

  it('rejects a closing reflection that is not last', () => {
    const bad = sample();
    const fields = bad.fields as Array<Record<string, unknown>>;
    const closing = fields.pop()!;
    fields.unshift(closing);
    const result = validateWorksheetContent(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/must be the last piece/);
  });

  it('rejects two closing reflections', () => {
    const bad = sample();
    (bad.fields as unknown[]).push({ id: 'closing_two', type: 'closing_reflection', prompt: 'Again?' });
    const result = validateWorksheetContent(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/only one closing reflection/);
  });

  it('rejects a choice with fewer than two options, and a repeated option value', () => {
    const one = sample();
    (one.fields as Array<Record<string, unknown>>)[2].options = [{ value: 'yes', label: 'Yes' }];
    expect(validateWorksheetContent(one).ok).toBe(false);

    const dup = sample();
    (dup.fields as Array<Record<string, unknown>>)[2].options = [
      { value: 'yes', label: 'Yes' },
      { value: 'yes', label: 'Also yes' },
    ];
    const result = validateWorksheetContent(dup);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/duplicate "yes"/);
  });

  it('rejects a branch pointing at a later or non-choice piece', () => {
    const later = sample();
    (later.fields as Array<Record<string, unknown>>)[3].visibleWhen = { field: 'park_it', in: ['yes'] };
    expect(validateWorksheetContent(later).ok).toBe(false);

    const notAChoice = sample();
    (notAChoice.fields as Array<Record<string, unknown>>)[3].visibleWhen = { field: 'facts', in: ['yes'] };
    const result = validateWorksheetContent(notAChoice);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/must be a choice or checklist/);
  });

  it('rejects a branch value that is not one of the options', () => {
    const bad = sample();
    (bad.fields as Array<Record<string, unknown>>)[3].visibleWhen = { field: 'can_act', in: ['maybe'] };
    const result = validateWorksheetContent(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/not an option of "can_act"/);
  });

  it('rejects a scale with an unknown key rather than inventing a range', () => {
    const bad = sample();
    (bad.fields as unknown[]).push({
      id: 'strength',
      type: 'scale_0_10',
      prompt: 'How strong?',
      max: 10,
    });
    const result = validateWorksheetContent(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/unknown key "max"/);
  });

  it('rejects checklist min greater than max', () => {
    const bad = sample();
    (bad.fields as unknown[]).push({
      id: 'patterns',
      type: 'checklist',
      prompt: 'Which fit?',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      minSelections: 3,
      maxSelections: 2,
    });
    const result = validateWorksheetContent(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/maxSelections/);
  });

  it('rejects feelings nested more than one level, or with an unknown parent', () => {
    const deep = sample();
    (deep.fields as unknown[]).push({
      id: 'feelings',
      type: 'feelings_picker',
      prompt: 'Which feeling?',
      feelings: [
        { id: 'scared', label: 'Scared' },
        { id: 'worried', label: 'Worried', parent: 'scared' },
        { id: 'about_exams', label: 'About exams', parent: 'worried' },
      ],
    });
    const deepResult = validateWorksheetContent(deep);
    expect(deepResult.ok).toBe(false);
    if (!deepResult.ok) expect(deepResult.errors.join(' ')).toMatch(/only one level deep/);

    const orphan = sample();
    (orphan.fields as unknown[]).push({
      id: 'feelings',
      type: 'feelings_picker',
      prompt: 'Which feeling?',
      feelings: [{ id: 'worried', label: 'Worried', parent: 'missing' }],
    });
    const orphanResult = validateWorksheetContent(orphan);
    expect(orphanResult.ok).toBe(false);
    if (!orphanResult.ok) expect(orphanResult.errors.join(' ')).toMatch(/unknown feeling/);
  });

  it('rejects a row list with no columns or an unknown column type', () => {
    const empty = sample();
    (empty.fields as unknown[]).push({ id: 'rows', type: 'row_list', prompt: 'Add rows', columns: [] });
    expect(validateWorksheetContent(empty).ok).toBe(false);

    const badType = sample();
    (badType.fields as unknown[]).push({
      id: 'rows',
      type: 'row_list',
      prompt: 'Add rows',
      columns: [{ id: 'what', label: 'What', type: 'number' }],
    });
    const result = validateWorksheetContent(badType);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/must be text, scale_0_10 or datetime/);
  });

  it('rejects a date picker with neither date nor time', () => {
    const bad = sample();
    (bad.fields as unknown[]).push({
      id: 'when',
      type: 'datetime',
      prompt: 'When?',
      withDate: false,
      withTime: false,
    });
    const result = validateWorksheetContent(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/at least a date or a time/);
  });

  it('rejects an unknown closing button action and duplicate actions', () => {
    const bad = sample();
    bad.closing = { buttons: [{ label: 'Go', action: 'launch_missiles' }] };
    expect(validateWorksheetContent(bad).ok).toBe(false);

    const dup = sample();
    dup.closing = {
      buttons: [
        { label: 'Done', action: 'done' },
        { label: 'Finished', action: 'done' },
      ],
    };
    const result = validateWorksheetContent(dup);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/duplicate "done"/);
  });
});

describe('validateWorksheetTranslation', () => {
  it('accepts a translation with the same ids and values', () => {
    const en = validateWorksheetContent(sample());
    expect(en.ok).toBe(true);
    if (!en.ok) return;

    const hi = JSON.parse(JSON.stringify(sample())) as Record<string, unknown>;
    for (const field of hi.fields as Array<Record<string, unknown>>) field.prompt = 'अनुवाद';
    const hiResult = validateWorksheetContent(hi);
    expect(hiResult.ok).toBe(true);
    if (!hiResult.ok) return;

    expect(validateWorksheetTranslation(en.content, hiResult.content)).toEqual([]);
  });

  it('rejects a missing piece, a mismatched id, and changed option values', () => {
    const en = validateWorksheetContent(sample());
    expect(en.ok).toBe(true);
    if (!en.ok) return;

    const short = JSON.parse(JSON.stringify(sample())) as Record<string, unknown>;
    (short.fields as unknown[]).pop();
    const shortResult = validateWorksheetContent(short);
    expect(shortResult.ok).toBe(true);
    if (shortResult.ok) {
      expect(validateWorksheetTranslation(en.content, shortResult.content).join(' ')).toMatch(
        /pieces against/,
      );
    }

    const reordered = JSON.parse(JSON.stringify(sample())) as Record<string, unknown>;
    (reordered.fields as Array<Record<string, unknown>>)[1].id = 'something_else';
    const reorderedResult = validateWorksheetContent(reordered);
    expect(reorderedResult.ok).toBe(true);
    if (reorderedResult.ok) {
      expect(validateWorksheetTranslation(en.content, reorderedResult.content).join(' ')).toMatch(
        /id "something_else"/,
      );
    }

    const values = JSON.parse(JSON.stringify(sample())) as Record<string, unknown>;
    const valuesFields = values.fields as Array<Record<string, unknown>>;
    valuesFields[2].options = [
      { value: 'haan', label: 'हाँ' },
      { value: 'baad_mein', label: 'बाद में' },
    ];
    // The branch has to move with the values, or the content is invalid — which
    // is the point of the branch check above.
    valuesFields[3].visibleWhen = { field: 'can_act', in: ['haan'] };
    valuesFields[4].visibleWhen = { field: 'can_act', in: ['baad_mein'] };
    const valuesResult = validateWorksheetContent(values);
    expect(valuesResult.ok).toBe(true);
    if (valuesResult.ok) {
      expect(validateWorksheetTranslation(en.content, valuesResult.content).join(' ')).toMatch(
        /option values differ/,
      );
    }
  });
});

describe('branching', () => {
  const content = validateWorksheetContent(sample());
  if (!content.ok) throw new Error('fixture must be valid');

  it('shows the branch for the answer given, and only that branch', () => {
    const yes = visibleFields(content.content, { can_act: 'yes' }).map((f) => f.id);
    expect(yes).toContain('first_step');
    expect(yes).not.toContain('park_it');

    const no = visibleFields(content.content, { can_act: 'not_now' }).map((f) => f.id);
    expect(no).toContain('park_it');
    expect(no).not.toContain('first_step');
  });

  it('shows neither branch until the choice is answered', () => {
    const ids = visibleFields(content.content, {}).map((f) => f.id);
    expect(ids).not.toContain('first_step');
    expect(ids).not.toContain('park_it');
  });

  it('matches any of several values, which is how "yes or partly" works', () => {
    const field = content.content.fields[3];
    expect(isFieldVisible({ ...field, visibleWhen: { field: 'can_act', in: ['yes', 'not_now'] } }, { can_act: 'not_now' })).toBe(true);
  });
});

describe('validateWorksheetAnswers', () => {
  const content = validateWorksheetContent(sample());
  if (!content.ok) throw new Error('fixture must be valid');
  const ws = content.content;

  it('passes when required pieces are answered and branches agree', () => {
    expect(validateWorksheetAnswers(ws, { facts: 'A thing happened', can_act: 'yes', first_step: 'Ask' })).toEqual([]);
  });

  it('reports a missing required answer', () => {
    const errors = validateWorksheetAnswers(ws, { can_act: 'yes' });
    expect(errors.join(' ')).toMatch(/facts: an answer is required/);
  });

  it('does not require a piece that the branch hid', () => {
    expect(missingRequiredFields(ws, { facts: 'x', can_act: 'not_now' })).toEqual([]);
  });

  it('rejects an answer to a hidden branch', () => {
    const errors = validateWorksheetAnswers(ws, { facts: 'x', can_act: 'yes', park_it: '2026-11-10T18:00' });
    expect(errors.join(' ')).toMatch(/park_it: answered but not shown/);
  });

  it('rejects a scale outside 0-10 and a non-integer', () => {
    const withScale = validateWorksheetContent({
      version: 1,
      fields: [
        { id: 'strength', type: 'scale_0_10', prompt: 'How strong?', required: true },
        { id: 'belief', type: 'scale_0_100', prompt: 'How much do you believe it?' },
      ],
    });
    expect(withScale.ok).toBe(true);
    if (!withScale.ok) return;

    expect(validateWorksheetAnswers(withScale.content, { strength: 0 })).toEqual([]);
    expect(validateWorksheetAnswers(withScale.content, { strength: 10, belief: 100 })).toEqual([]);
    expect(validateWorksheetAnswers(withScale.content, { strength: 11 }).join(' ')).toMatch(/0 and 10/);
    expect(validateWorksheetAnswers(withScale.content, { strength: 7.5 }).join(' ')).toMatch(/0 and 10/);
    expect(validateWorksheetAnswers(withScale.content, { strength: 5, belief: 101 }).join(' ')).toMatch(/0 and 100/);
  });

  it('rejects an unknown choice value and respects checklist limits', () => {
    const errors = validateWorksheetAnswers(ws, { facts: 'x', can_act: 'maybe' });
    expect(errors.join(' ')).toMatch(/not one of its options/);

    const withChecklist = validateWorksheetContent({
      version: 1,
      fields: [
        {
          id: 'patterns',
          type: 'checklist',
          prompt: 'Which fit?',
          options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
            { value: 'c', label: 'C' },
          ],
          maxSelections: 2,
        },
      ],
    });
    expect(withChecklist.ok).toBe(true);
    if (!withChecklist.ok) return;
    expect(validateWorksheetAnswers(withChecklist.content, { patterns: ['a', 'b'] })).toEqual([]);
    expect(validateWorksheetAnswers(withChecklist.content, { patterns: ['a', 'b', 'c'] }).join(' ')).toMatch(/at most 2/);
    expect(validateWorksheetAnswers(withChecklist.content, { patterns: ['z'] }).join(' ')).toMatch(/not one of its options/);
  });

  it('checks feelings picks and their strengths', () => {
    const wf = validateWorksheetContent({
      version: 1,
      fields: [
        {
          id: 'feelings',
          type: 'feelings_picker',
          prompt: 'Which feeling?',
          feelings: [
            { id: 'scared', label: 'Scared' },
            { id: 'worried', label: 'Worried', parent: 'scared' },
          ],
          maxSelections: 2,
          withStrength: true,
        },
      ],
    });
    expect(wf.ok).toBe(true);
    if (!wf.ok) return;

    expect(
      validateWorksheetAnswers(wf.content, {
        feelings: { picked: ['scared', 'worried'], strength: { scared: 8, worried: 6 } },
      }),
    ).toEqual([]);

    expect(
      validateWorksheetAnswers(wf.content, { feelings: { picked: ['scared'], strength: { scared: 12 } } }).join(' '),
    ).toMatch(/between 0 and 10/);

    expect(
      validateWorksheetAnswers(wf.content, { feelings: { picked: ['scared'], strength: { worried: 4 } } }).join(' '),
    ).toMatch(/unpicked feeling/);

    expect(
      validateWorksheetAnswers(wf.content, { feelings: { picked: ['furious'] } }).join(' '),
    ).toMatch(/not one of its feelings/);
  });

  it('checks row lists against their columns and row cap', () => {
    const wf = validateWorksheetContent({
      version: 1,
      fields: [
        {
          id: 'drains',
          type: 'row_list',
          prompt: 'What drained you?',
          maxRows: 2,
          columns: [
            { id: 'what', label: 'What', type: 'text' },
            { id: 'how_much', label: 'How much?', type: 'scale_0_10' },
          ],
        },
      ],
    });
    expect(wf.ok).toBe(true);
    if (!wf.ok) return;

    expect(
      validateWorksheetAnswers(wf.content, { drains: [{ what: 'Classes', how_much: 8 }] }),
    ).toEqual([]);
    expect(
      validateWorksheetAnswers(wf.content, { drains: [{ what: 'Classes', how_much: 11 }] }).join(' '),
    ).toMatch(/between 0 and 10/);
    expect(
      validateWorksheetAnswers(wf.content, { drains: [{ what: 'x' }, { what: 'y' }, { what: 'z' }] }).join(' '),
    ).toMatch(/at most 2 rows/);
  });

  it('checks date and time strings', () => {
    const wf = validateWorksheetContent({
      version: 1,
      fields: [{ id: 'when', type: 'datetime', prompt: 'When?', withDate: true, withTime: true }],
    });
    expect(wf.ok).toBe(true);
    if (!wf.ok) return;

    expect(validateWorksheetAnswers(wf.content, { when: '2026-11-10T18:30' })).toEqual([]);
    expect(validateWorksheetAnswers(wf.content, { when: '2026-11-10' })).toEqual([]);
    expect(validateWorksheetAnswers(wf.content, { when: '10/11/2026' }).join(' ')).toMatch(/YYYY-MM-DD/);
    expect(validateWorksheetAnswers(wf.content, { when: '2026-11-10T25:00' }).join(' ')).toMatch(/HH:mm/);
  });

  it('rejects an answer to a piece that does not exist', () => {
    expect(validateWorksheetAnswers(ws, { facts: 'x', can_act: 'yes', ghost: 'boo' }).join(' ')).toMatch(
      /ghost: not a piece/,
    );
  });

  it('rejects an answer attached to an instruction', () => {
    expect(validateWorksheetAnswers(ws, { what_happened: 'text', facts: 'x', can_act: 'yes' }).join(' ')).toMatch(
      /does not take an answer/,
    );
  });
});

describe('worksheetProgress', () => {
  it('counts answerable pieces, including the branch that applies', () => {
    const content = validateWorksheetContent(sample());
    if (!content.ok) throw new Error('fixture must be valid');

    // The branching pieces are not counted until the answer that shows them is
    // given, so the total grows from 2 to 3 on that choice. That is deliberate:
    // a client is never told there are steps they cannot see.
    expect(worksheetProgress(content.content, {})).toEqual({ answered: 0, total: 2 });
    expect(worksheetProgress(content.content, { facts: 'x', can_act: 'yes' })).toEqual({
      answered: 2,
      total: 3,
    });
    expect(
      worksheetProgress(content.content, { facts: 'x', can_act: 'yes', first_step: 'Ask' }),
    ).toEqual({ answered: 3, total: 3 });
  });
});
