/**
 * The four "All" extras of 25 November 2026.
 *
 * These assert the machinery and the rules, not the clinical wording — the
 * wording is checked against the generated review document in
 * `46-draft-all-plans-copy.md`, so this file never becomes a second copy of it.
 */
import { describe, expect, it } from 'vitest';
import { validateWorksheetAnswers, validateWorksheetContent, type WorksheetContent } from '../worksheet';
import { CATALOGUE, FEELINGS_EN, toRegistryRow } from '../worksheets/index';
import { ALL_PLANS_BATCH_IDS } from '../worksheets/all-plans';
import { worksheetRequestProblems, worksheetRowProblems } from '../worksheet';

const entryById = (id: string) => CATALOGUE.find((row) => row.tool_id === id);

describe('the "All" batch', () => {
  it('has all four rows, in the owner\'s order, labelled `all`', () => {
    expect([...ALL_PLANS_BATCH_IDS]).toEqual([
      'ws_body_map',
      'ws_sleep_diary',
      'ws_muscle_relaxation',
      'ws_safe_place',
    ]);
    for (const id of ALL_PLANS_BATCH_IDS) {
      const entry = entryById(id);
      expect(entry, id).toBeTruthy();
      expect(entry!.care_plans, id).toEqual(['all']);
    }
  });

  it('leaves every one of them switched off for clients', () => {
    // Rule 2: draft until the owner reads the wording. A draft cannot be
    // listed, opened or assigned.
    for (const id of ALL_PLANS_BATCH_IDS) {
      expect(entryById(id)!.status, id).toBe('draft');
    }
  });

  it('carries the deeper safety screen on the Sleep diary and nowhere else', () => {
    expect(entryById('ws_sleep_diary')!.sensitive_check).toBe(true);
    for (const id of ['ws_body_map', 'ws_muscle_relaxation', 'ws_safe_place']) {
      expect(entryById(id)!.sensitive_check, id).toBe(false);
    }
  });

  it('passes the row and content guards with no problems', () => {
    for (const id of ALL_PLANS_BATCH_IDS) {
      const entry = entryById(id)!;
      expect({ id, problems: worksheetRowProblems(toRegistryRow(entry)) }, id).toEqual({ id, problems: [] });
      expect(worksheetRequestProblems(entry.content_en), id).toEqual([]);
    }
  });

  it('asks for no medicine, weight, measurement or calorie field on the sleep diary', () => {
    // The sleep diary is the likeliest place a medicine field would creep in, so
    // the guard is asserted on it by name rather than only in the group above.
    const problems = worksheetRequestProblems(entryById('ws_sleep_diary')!.content_en);
    expect(problems).toEqual([]);
  });
});

describe('Where do I feel it?', () => {
  const bodyMap = entryById('ws_body_map')!;
  const field = bodyMap.content_en!.fields[0];

  it('uses the body outline piece with a feelings picker for each spot', () => {
    expect(field.type).toBe('body_outline');
    if (field.type !== 'body_outline') throw new Error('unreachable');
    expect(field.withFeelings).toBe(true);
    expect(field.feelingsPrompt).toBeTruthy();
    expect(field.feelings?.length).toBe(FEELINGS_EN.length);
  });

  it('asks only where and what, with no strength rating', () => {
    // The approved copy asks "Where do you feel it right now?" and "What's the
    // feeling there?", and nothing about how strong it is. A slider with no
    // approved wording would be client copy the owner never saw, so the piece
    // carries no strength rating and no strength prompt.
    if (field.type !== 'body_outline') throw new Error('unreachable');
    expect(field.withStrength).toBeFalsy();
    expect(field.strengthPrompt).toBeFalsy();
  });

  it('says what happens at the three-spot cap', () => {
    if (field.type !== 'body_outline') throw new Error('unreachable');
    expect(field.maxSelections).toBe(3);
    expect(field.fullMessage).toBe(
      'You can pick up to three. Tap a spot again to remove it.',
    );
  });

  it('carries the approved name and Library line', () => {
    expect(bodyMap.label).toBe('Where do I feel it?');
    expect(bodyMap.summary).toBe('Feelings often show up in your body first. Find where.');
  });

  it('offers every part on the outline the app can draw', () => {
    if (field.type !== 'body_outline') throw new Error('unreachable');
    const ids = field.regions.map((r) => r.id);
    // The ids the app maps to a drawn spot; a part outside this list still
    // renders as a chip, so nothing is unreachable either way.
    for (const id of ['head', 'chest', 'stomach', 'shoulders', 'hands', 'legs', 'feet']) {
      expect(ids, id).toContain(id);
    }
  });

  it('has no duplicate part ids', () => {
    if (field.type !== 'body_outline') throw new Error('unreachable');
    expect(new Set(field.regions.map((r) => r.id)).size).toBe(field.regions.length);
  });
});

describe('body outline with per-part feelings', () => {
  function bodyOnly(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      version: 1,
      fields: [
        {
          id: 'where',
          type: 'body_outline',
          prompt: 'Where?',
          fullMessage: 'You can pick up to three. Tap a spot again to remove it.',
          regions: [
            { id: 'chest', label: 'Chest' },
            { id: 'stomach', label: 'Stomach' },
          ],
          withFeelings: true,
          feelingsPrompt: 'What does it feel like there?',
          feelings: [
            { id: 'sad', label: 'sad' },
            { id: 'tense', label: 'tense' },
          ],
          ...over,
        },
      ],
    };
  }

  it('accepts a piece that offers feelings per part', () => {
    const result = validateWorksheetContent(bodyOnly());
    expect(result.ok).toBe(true);
  });

  it('refuses the flag with no vocabulary to pick from', () => {
    const result = validateWorksheetContent(bodyOnly({ feelings: undefined }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toContain('at least one feeling is required');
  });

  it('refuses a vocabulary nobody is offered', () => {
    const result = validateWorksheetContent(bodyOnly({ withFeelings: false }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toContain('needs withFeelings');
  });

  it('refuses a prompt with no picker behind it', () => {
    const result = validateWorksheetContent(bodyOnly({ withFeelings: undefined }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toContain('feelingsPrompt: needs withFeelings');
  });

  function content(): WorksheetContent {
    const result = validateWorksheetContent(bodyOnly());
    if (!result.ok) throw new Error('fixture must be valid');
    return result.content;
  }

  it('accepts feelings keyed by a tapped part', () => {
    const errors = validateWorksheetAnswers(content(), {
      where: { picked: ['chest'], feelings: { chest: ['tense'] } },
    });
    expect(errors).toEqual([]);
  });

  it('refuses feelings for a part that was not tapped', () => {
    const errors = validateWorksheetAnswers(content(), {
      where: { picked: ['chest'], feelings: { stomach: ['sad'] } },
    });
    expect(errors.join(' ')).toContain('feelings given for untapped part "stomach"');
  });

  it('refuses a feeling that is not in its vocabulary', () => {
    const errors = validateWorksheetAnswers(content(), {
      where: { picked: ['chest'], feelings: { chest: ['furious'] } },
    });
    expect(errors.join(' ')).toContain('"furious" is not one of its feelings');
  });

  it('caps the feelings per part at the piece\'s own limit', () => {
    const errors = validateWorksheetAnswers(content(), {
      where: { picked: ['chest'], feelings: { chest: ['sad', 'tense', 'sad', 'tense'] } },
    });
    expect(errors.join(' ')).toContain('at most 3 feelings');
  });
});
