/**
 * The four "All" extras of 25 November 2026.
 *
 * These assert the machinery and the rules, not the clinical wording — the
 * wording is checked against the generated review document in
 * `46-draft-all-plans-copy.md`, so this file never becomes a second copy of it.
 */
import { describe, expect, it } from 'vitest';
import {
  scriptRunSeconds,
  validateWorksheetAnswers,
  validateWorksheetContent,
  type WorksheetContent,
} from '../worksheet';
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

  it('switches every one of them on, dated the day the owner approved them', () => {
    // Owner, 26 Nov 2026: "Approve and switch on the four extras." The catalogue
    // says approved; the deployed rows are moved by their own migration.
    for (const id of ALL_PLANS_BATCH_IDS) {
      expect(entryById(id)!.status, id).toBe('approved');
      expect(entryById(id)!.approved_at, id).toBe('2026-11-26');
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

describe('the read-along script stage', () => {
  const body = (script: unknown, fields?: unknown[]) => ({
    version: 1,
    script,
    fields: fields ?? [
      { id: 'settle', type: 'instruction', prompt: 'Get comfortable.' },
      { id: 'hold', type: 'instruction', prompt: 'Hold… and let go.' },
      { id: 'after', type: 'scale_0_10', prompt: 'How do you feel now?' },
    ],
  });

  const timing = { secondsPerWords: 3, minSeconds: 6, gapSeconds: 10 };

  it('accepts a script whose instruction pieces are one run', () => {
    expect(validateWorksheetContent(body(timing)).ok).toBe(true);
  });

  it('accepts the hold, and accepts a script that has none', () => {
    expect(validateWorksheetContent(body({ ...timing, holdExtraSeconds: 5 })).ok).toBe(true);
    expect(validateWorksheetContent(body(timing)).ok).toBe(true);
  });

  it('refuses a script with no line to read', () => {
    const result = validateWorksheetContent(
      body(timing, [{ id: 'after', type: 'scale_0_10', prompt: 'How do you feel now?' }]),
    );
    expect(result.errors.join(' ')).toContain('needs at least one instruction piece');
  });

  it('refuses instructions split into two runs', () => {
    const result = validateWorksheetContent(
      body(timing, [
        { id: 'a', type: 'instruction', prompt: 'One.' },
        { id: 'b', type: 'short_text', prompt: 'A question.' },
        { id: 'c', type: 'instruction', prompt: 'Two.' },
      ]),
    );
    expect(result.errors.join(' ')).toContain('one unbroken run');
  });

  it('refuses seconds that are not whole numbers in range', () => {
    const errors = (patch: Record<string, unknown>) =>
      validateWorksheetContent(body({ ...timing, ...patch })).errors.join(' ');
    expect(errors({ secondsPerWords: 0 })).toContain('secondsPerWords');
    expect(errors({ secondsPerWords: 2.5 })).toContain('secondsPerWords');
    expect(errors({ minSeconds: 0 })).toContain('minSeconds');
    expect(errors({ gapSeconds: 2.5 })).toContain('gapSeconds');
    expect(errors({ gapSeconds: 121 })).toContain('gapSeconds');
    expect(errors({ holdExtraSeconds: 61 })).toContain('holdExtraSeconds');
  });

  it('refuses the old fixed-hold shape: a script must state the reading rule', () => {
    // `holdSeconds` was one number for every line. The owner replaced it on
    // 26 Nov 2026, and a body still written the old way is a body whose timing
    // nobody set — refuse it rather than guess.
    const old = validateWorksheetContent(body({ holdSeconds: 5, gapSeconds: 5 })).errors.join(' ');
    expect(old).toContain('unknown key "holdSeconds"');
    expect(old).toContain('secondsPerWords');
    expect(old).toContain('minSeconds');
  });

  it('is declared on Unclench and My calm place, and on nothing else', () => {
    expect(entryById('ws_muscle_relaxation')!.content_en!.script).toEqual({
      secondsPerWords: 3,
      minSeconds: 6,
      gapSeconds: 10,
      holdExtraSeconds: 5,
    });
    expect(entryById('ws_safe_place')!.content_en!.script).toEqual({
      secondsPerWords: 3,
      minSeconds: 6,
      gapSeconds: 15,
    });
    for (const row of CATALOGUE) {
      if (row.tool_id === 'ws_muscle_relaxation' || row.tool_id === 'ws_safe_place') continue;
      expect(row.content_en?.script, row.tool_id).toBeUndefined();
    }
  });
});

describe('the two read-along scripts', () => {
  const lines = (id: string): string[] => {
    const fields = entryById(id)!.content_en!.fields;
    return fields.filter((field) => field.type === 'instruction').map((field) => field.prompt!);
  };

  it('uses the owner\'s timing rule, and nothing else', () => {
    // Set 26 Nov 2026, revised 27 Nov 2026: a second for every three words,
    // never under six; five extra seconds on each "hold" line, which belongs to
    // Unclench only; and the quiet after each line is per piece — ten seconds on
    // Unclench to notice the release, fifteen on My calm place to picture it.
    expect(entryById('ws_muscle_relaxation')!.content_en!.script).toEqual({
      secondsPerWords: 3,
      minSeconds: 6,
      gapSeconds: 10,
      holdExtraSeconds: 5,
    });
    expect(entryById('ws_safe_place')!.content_en!.script).toEqual({
      secondsPerWords: 3,
      minSeconds: 6,
      gapSeconds: 15,
    });
  });

  it('runs for the time quoted to the owner: Unclench 2m25s, My calm place 1m48s', () => {
    // 145s and 108s. Pinned as totals so a wording change that halves the
    // exercise cannot pass silently; the per-line numbers are in the report the
    // owner was given on 27 Nov 2026.
    expect(
      scriptRunSeconds(lines('ws_muscle_relaxation'), entryById('ws_muscle_relaxation')!.content_en!.script!),
    ).toBe(145);
    expect(scriptRunSeconds(lines('ws_safe_place'), entryById('ws_safe_place')!.content_en!.script!)).toBe(108);
  });

  it('gives the hold to Unclench\'s tense lines and to no line of My calm place', () => {
    const unclench = entryById('ws_muscle_relaxation')!.content_en!.script!;
    const holds = lines('ws_muscle_relaxation').filter((line) => /\bhold\b/i.test(line));
    // Six of the seven lines say "hold": the settle line does not.
    expect(holds.length).toBe(6);
    const place = entryById('ws_safe_place')!.content_en!.script!;
    expect(lines('ws_safe_place').some((line) => /\bhold\b/i.test(line))).toBe(false);
    expect(unclench.holdExtraSeconds).toBe(5);
    expect(place.holdExtraSeconds).toBeUndefined();
  });
});
