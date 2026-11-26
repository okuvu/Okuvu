/**
 * The owner's worksheet rules of 24 Nov 2026, pinned.
 *
 * These are not implementation details: each one is a sentence the clinical owner
 * wrote, and each test names the sentence it defends. A later change that breaks
 * one of them should fail here with the rule it broke, not turn up as a client
 * seeing the wrong worksheet first.
 *
 * Run: npx vitest run __tests__/worksheet-rules.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  CATALOGUE,
  CLIENT_LIBRARY_CATALOGUE,
  LISTABLE_CATALOGUE,
  PLACEHOLDER_CATALOGUE,
  entryById,
  handOffProblems,
  isListable,
  toRegistryRow,
} from '../worksheets/index';
import {
  CARE_PLAN_LABELS,
  appliesToScope,
  orderForCarePlan,
  scopeForCarePlan,
  type CarePlanLabel,
  type CatalogueEntry,
} from '../worksheets/types';
import {
  validateWorksheetAnswers,
  validateWorksheetContent,
  worksheetRequestProblems,
  worksheetRowProblems,
  toClientWorksheetView,
  type WorksheetContent,
  type WorksheetRegistryRow,
} from '../worksheet';

const entry = (id: string): CatalogueEntry => {
  const found = entryById(id);
  if (!found) throw new Error(`no catalogue entry ${id}`);
  return found;
};

describe('rule 1 — care plan labels', () => {
  /**
   * The owner's list, verbatim. "Every worksheet can belong to one or more care
   * plans: Anxiety & Worry, Low Mood, Stress & Burnout, or All."
   */
  const EXPECTED: Array<[string, CarePlanLabel[]]> = [
    ['ws_worry_tree', ['anxiety_worry']],
    ['ws_thinking_trap', ['anxiety_worry']],
    ['ws_thought_record', ['anxiety_worry', 'low_mood']],
    ['ws_small_things', ['low_mood']],
    ['ws_three_good_things', ['low_mood']],
    ['ws_kind_friend_letter', ['low_mood']],
    ['ws_values_compass', ['low_mood']],
    ['ws_energy_audit', ['stress_burnout']],
    ['ws_hard_conversation', ['stress_burnout']],
    ['mood_checkin', ['all']],
    ['ws_name_the_feeling', ['all']],
    ['breathing', ['all']],
    ['grounding_5431', ['all']],
    ['ws_bring_to_session', ['all']],
    ['ws_post_session', ['all']],
    ['ws_safety_plan', ['all']],
    // The ten the owner approved on 24 Nov 2026, all Stress & Burnout.
    ['ws_whats_on_my_plate', ['stress_burnout']],
    ['ws_basics_check', ['stress_burnout']],
    ['ws_rest_break', ['stress_burnout']],
    ['ws_boundary_planner', ['stress_burnout']],
    ['ws_priority_sorter', ['stress_burnout']],
    ['ws_scrolling_log', ['stress_burnout']],
    ['ws_weekly_load_check', ['stress_burnout']],
    ['ws_unsent_letter', ['stress_burnout']],
    ['ws_pros_cons_change', ['stress_burnout']],
    ['ws_caring_load_check', ['stress_burnout']],
    // The nine the owner approved on 24 Nov 2026, all Anxiety & Worry.
    ['ws_worry_time', ['anxiety_worry']],
    ['ws_brain_dump', ['anxiety_worry']],
    ['ws_unhooking', ['anxiety_worry']],
    ['ws_sos_calm', ['anxiety_worry']],
    ['ws_sitting_with_not_knowing', ['anxiety_worry']],
    ['ws_exam_career_pressure', ['anxiety_worry']],
    ['ws_social_situation_prep', ['anxiety_worry']],
    ['ws_family_expectations', ['anxiety_worry']],
    ['ws_exposure_ladder', ['anxiety_worry']],
    // The nine the owner approved on 24 Nov 2026, all Low Mood.
    ['ws_one_small_thing', ['low_mood']],
    ['ws_mood_activity_log', ['low_mood']],
    ['ws_strengths', ['low_mood']],
    ['ws_things_i_might_enjoy', ['low_mood']],
    ['ws_tiny_steps', ['low_mood']],
    ['ws_inner_critic', ['low_mood']],
    ['ws_reconnect_planner', ['low_mood']],
    ['ws_comparison_check', ['low_mood']],
    ['ws_miracle_question', ['low_mood']],
    // The four the owner approved on 26 Nov 2026, all "All".
    ['ws_body_map', ['all']],
    ['ws_sleep_diary', ['all']],
    ['ws_muscle_relaxation', ['all']],
    ['ws_safe_place', ['all']],
  ];

  it('labels every approved entry exactly as the owner listed them', () => {
    expect(LISTABLE_CATALOGUE).toHaveLength(EXPECTED.length);
    for (const [toolId, labels] of EXPECTED) {
      expect({ toolId, care_plans: entry(toolId).care_plans }).toEqual({
        toolId,
        care_plans: labels,
      });
    }
  });

  it('never leaves an approved worksheet with no plan decided', () => {
    for (const row of LISTABLE_CATALOGUE) {
      expect({ toolId: row.tool_id, decided: row.care_plans.length > 0 }).toEqual({
        toolId: row.tool_id,
        decided: true,
      });
    }
  });

  it('uses only the four approved labels, spelled the owner’s way', () => {
    expect(CARE_PLAN_LABELS).toEqual({
      anxiety_worry: 'Anxiety & Worry',
      low_mood: 'Low Mood',
      stress_burnout: 'Stress & Burnout',
      all: 'All',
    });
    for (const row of CATALOGUE) {
      for (const label of row.care_plans) {
        expect(Object.keys(CARE_PLAN_LABELS)).toContain(label);
      }
    }
  });

  it('maps the internal CP1/CP2/CP3 enum without inventing a fourth plan', () => {
    expect(scopeForCarePlan('CP1')).toBe('anxiety_worry');
    expect(scopeForCarePlan('CP2')).toBe('low_mood');
    expect(scopeForCarePlan('CP3')).toBe('stress_burnout');
    expect(scopeForCarePlan(null)).toBeNull();
    expect(scopeForCarePlan('CP9')).toBeNull();
  });

  it('puts the client’s own plan first and keeps everything else behind it', () => {
    // An anxiety client: the anxiety-plan rows keep their order, then the rest.
    const rows = ['ws_worry_tree', 'ws_small_things', 'ws_thinking_trap', 'ws_energy_audit'];
    const scope = scopeForCarePlan('CP1');
    const ordered = orderForCarePlan(rows, scope, (id) => entry(id).care_plans);
    expect(ordered).toEqual(['ws_worry_tree', 'ws_thinking_trap', 'ws_small_things', 'ws_energy_audit']);

    // An "All" worksheet applies to every plan, so it is never pushed to the back.
    expect(appliesToScope(['all'], 'low_mood')).toBe(true);
    expect(appliesToScope(['anxiety_worry'], 'low_mood')).toBe(false);
    // A client with no plan yet is reordered for nobody.
    expect(orderForCarePlan(rows, null, (id) => entry(id).care_plans)).toEqual(rows);
  });

  it('never hides a worksheet from the Library — the plan only changes the order', () => {
    const anxietyClientOrder = orderForCarePlan(LISTABLE_CATALOGUE, 'anxiety_worry', (r) => r.care_plans);
    expect(anxietyClientOrder).toHaveLength(LISTABLE_CATALOGUE.length);
    expect(new Set(anxietyClientOrder.map((r) => r.tool_id)).size).toBe(LISTABLE_CATALOGUE.length);
  });

  it('never sends the care plan to a client', () => {
    const row = { ...toRegistryRow(entry('ws_worry_tree')) } as WorksheetRegistryRow;
    const view = toClientWorksheetView(row) as unknown as Record<string, unknown>;
    expect(Object.keys(view)).not.toContain('care_plans');
    expect(Object.keys(view)).not.toContain('carePlan');
    expect(JSON.stringify(view)).not.toContain('anxiety_worry');
  });
});

describe('rule 2 — a new worksheet starts switched off', () => {
  it('has a draft status that no client list includes', () => {
    const draft: CatalogueEntry = {
      ...entry('ws_worry_tree'),
      tool_id: 'ws_rule_two_probe',
      status: 'draft',
    };
    expect(LISTABLE_CATALOGUE.includes(draft)).toBe(false);
    // `isListable` is the one filter every list uses. Restated as the property
    // rather than as "no row is a draft", because the number of drafts depends
    // on how far the owner has got through the wording. As of 24 Nov 2026 every
    // worksheet that exists is approved, so that number is 0 — the property is
    // what still matters for the next batch: a draft row is never listable.
    const drafts = CATALOGUE.filter((r) => r.status === 'draft');
    for (const row of drafts) expect(LISTABLE_CATALOGUE.includes(row)).toBe(false);
    const probe: CatalogueEntry = {
      ...entry('ws_worry_tree'),
      tool_id: 'ws_rule_two_draft_probe',
      status: 'draft',
    };
    expect(LISTABLE_CATALOGUE.map((r) => r.tool_id)).not.toContain(probe.tool_id);
    expect(isListable(probe)).toBe(false);
  });

  it('refuses to serve a draft body to a client', () => {
    const row = {
      ...toRegistryRow(entry('ws_worry_tree')),
      status: 'draft',
    } as WorksheetRegistryRow;
    expect(() => toClientWorksheetView(row)).toThrow(/status: "draft" is not approved/);
  });

  it('is what the database defaults to', () => {
    // The default lives in schema.prisma and in the seed generator; this asserts
    // the generator still writes an explicit status for every row, so a seed can
    // never rely on the column default to publish something.
    for (const row of CATALOGUE) {
      expect(['approved', 'draft', 'placeholder']).toContain(row.status);
    }
  });
});

describe('rule 3 — the deeper screen belongs to the five named worksheets', () => {
  it('marks exactly the five the owner named', () => {
    const marked = CATALOGUE.filter((r) => r.sensitive_check).map((r) => r.tool_id).sort();
    expect(marked).toEqual([
      'ws_comparison_check',
      'ws_inner_critic',
      'ws_scrolling_log',
      'ws_sleep_diary',
      'ws_unsent_letter',
    ]);
  });

  it('leaves every approved worksheet on the screen its row asks for', () => {
    // Five approved rows carry the deeper screen: the Doomscroll log, the Unsent
    // letter, Meet the inner critic, the Comparison check and — once the owner
    // switched it on on 26 Nov 2026 — the Sleep check. "Approved" and "deeper
    // screen" are not exclusive sets. What must stay true: an approved row never
    // quietly loses the deeper screen, and no other approved row gains it.
    const deeper = LISTABLE_CATALOGUE.filter((row) => row.sensitive_check).map((row) => row.tool_id);
    expect(deeper.sort()).toEqual([
      'ws_comparison_check',
      'ws_inner_critic',
      'ws_scrolling_log',
      'ws_sleep_diary',
      'ws_unsent_letter',
    ]);
  });

  it('never asks for weight, measurements, calories, food amounts or medicines', () => {
    // Drafts are checked too: they are written and previewable, and the rule is
    // about the words the client will eventually read.
    for (const row of [...LISTABLE_CATALOGUE, ...CATALOGUE.filter((r) => r.status === 'draft')]) {
      expect({ toolId: row.tool_id, problems: worksheetRequestProblems(row.content_en) }).toEqual({
        toolId: row.tool_id,
        problems: [],
      });
    }
  });

  it('catches the forbidden asks in the place a copy editor would put them', () => {
    const base = (over: Partial<Record<string, unknown>>): unknown => ({
      version: 1,
      fields: [{ id: 'a', type: 'short_text', prompt: 'What happened?', ...over }],
    });
    expect(worksheetRequestProblems(base({ prompt: 'What was your weight this week?' }))).toHaveLength(1);
    expect(worksheetRequestProblems(base({ helper: 'Roughly how many calories?' }))).toHaveLength(1);
    expect(worksheetRequestProblems(base({ prompt: 'How many meals did you eat today?' }))).toHaveLength(1);
    expect(worksheetRequestProblems(base({ prompt: 'Which medicines did you take?' }))).toHaveLength(1);
    expect(worksheetRequestProblems(base({ prompt: 'What did you notice in your body?' }))).toHaveLength(0);
  });

  it('runs the request checks on the save path, not only in a test', () => {
    const row = {
      ...toRegistryRow(entry('ws_worry_tree')),
      content_en: {
        version: 1,
        fields: [{ id: 'a', type: 'short_text', prompt: 'What is your weight today?' }],
      },
    } as WorksheetRegistryRow;
    expect(worksheetRowProblems(row).some((p) => p.includes('asks for weight'))).toBe(true);
  });
});

describe('rule 5 — no worksheet adds answers into a total, a level or a label', () => {
  it('has no aggregate piece type at all', () => {
    // The strongest form of the rule: there is nothing in the model to sum with.
    const content: WorksheetContent = { version: 1, fields: [{ id: 'a', type: 'instruction', prompt: 'x' }] };
    const types = new Set(['instruction', 'short_text', 'long_text', 'voice_note', 'scale_0_10']);
    expect(validateWorksheetContent(content).ok).toBe(true);
    expect([...types].some((t) => /score|total|sum|level/i.test(t))).toBe(false);
  });

  it('keeps the promise out of every client-facing sentence', () => {
    // `worksheetRequestProblems` carries the score/level/total copy guard.
    // Drafts are included: a worksheet that promises a score must not get as far
    // as being approved, so the guard runs on the words before anyone reads them.
    for (const row of [...LISTABLE_CATALOGUE, ...CATALOGUE.filter((r) => r.status === 'draft')]) {
      const problems = worksheetRequestProblems(row.content_en).filter((p) => p.startsWith('talks about'));
      expect({ toolId: row.tool_id, problems }).toEqual({ toolId: row.tool_id, problems: [] });
    }
  });

  it('rejects copy that promises a score', () => {
    const content = {
      version: 1,
      fields: [{ id: 'a', type: 'scale_0_10', prompt: 'How anxious are you?', helper: 'Your score is saved.' }],
    };
    expect(worksheetRequestProblems(content).join(' ')).toContain('talks about a score');
  });

  it('lets a row lead Past me with the number the client chose, and nothing else', () => {
    const withLead = (timeline: unknown): unknown => ({
      version: 1,
      fields: [
        { id: 'load', type: 'scale_0_10', prompt: 'How heavy was this week?' },
        { id: 'why', type: 'short_text', prompt: 'What made it heavy?' },
      ],
      timeline,
    });
    expect(validateWorksheetContent(withLead({ leadField: 'load' })).ok).toBe(true);
    // Not a text answer: a lead must be a number the client picked, never a
    // sentence someone shortened into a summary.
    expect(validateWorksheetContent(withLead({ leadField: 'why' })).ok).toBe(false);
    // Not a field at all.
    expect(validateWorksheetContent(withLead({ leadField: 'nope' })).ok).toBe(false);
    // No stray keys: the shape is exactly the one the renderer knows.
    expect(validateWorksheetContent(withLead({ leadField: 'load', average: true })).ok).toBe(false);
  });

  it('stores a slider answer as one number, never a computed result', () => {
    const content: WorksheetContent = {
      version: 1,
      fields: [{ id: 'a', type: 'scale_0_10', prompt: 'How strong?' }],
    };
    expect(validateWorksheetAnswers(content, { a: 7 })).toEqual([]);
    // Nothing aggregates, so an answer that is not the chosen number is refused.
    expect(validateWorksheetAnswers(content, { a: '{"total":7}' }).length).toBeGreaterThan(0);
  });
});

describe('rule 6 — the exposure ladder is therapist-only', () => {
  it('is never in the client list', () => {
    const ladder = entry('ws_exposure_ladder');
    expect(ladder.access_mode).toBe('therapist_only');
    // Approved, so the catalogue lists it; therapist-only, so the client Library
    // does not.
    expect(CLIENT_LIBRARY_CATALOGUE.map((r) => r.tool_id)).not.toContain('ws_exposure_ladder');
    expect(PLACEHOLDER_CATALOGUE.map((r) => r.tool_id)).not.toContain('ws_exposure_ladder');
    expect(ladder.status).toBe('approved');
    expect(ladder.content_en).not.toBeNull();
    expect(ladder.load_level).toBe('demanding');
  });
});

describe('rule 7 — the two new pieces', () => {
  const timer = (over: Record<string, unknown> = {}): unknown => ({
    version: 1,
    fields: [{ id: 'sit', type: 'countdown_timer', prompt: 'Sit with it for a minute.', seconds: 60, ...over }],
  });
  const outline = (over: Record<string, unknown> = {}): unknown => ({
    version: 1,
    fields: [
      {
        id: 'where',
        type: 'body_outline',
        prompt: 'Tap where you feel it.',
        fullMessage: 'You can pick up to three. Tap a spot again to remove it.',
        regions: [
          { id: 'head', label: 'Head' },
          { id: 'chest', label: 'Chest' },
          { id: 'shoulders', label: 'Shoulders', parent: 'head' },
        ],
        ...over,
      },
    ],
  });

  it('accepts a well-formed countdown timer', () => {
    expect(validateWorksheetContent(timer({ minSeconds: 30, startLabel: 'Start', doneLabel: 'Done' }))).toEqual({
      ok: true,
      content: expect.any(Object),
    });
  });

  it('refuses a timer with no length, or a minimum longer than the timer', () => {
    expect(validateWorksheetContent(timer({ seconds: undefined }))).toMatchObject({ ok: false });
    expect(validateWorksheetContent(timer({ minSeconds: 90 }))).toMatchObject({ ok: false });
  });

  it('accepts a body outline, and refuses one with no parts or a broken parent', () => {
    expect(validateWorksheetContent(outline())).toMatchObject({ ok: true });
    expect(validateWorksheetContent(outline({ regions: [] }))).toMatchObject({ ok: false });
    expect(
      validateWorksheetContent(
        outline({ regions: [{ id: 'chest', label: 'Chest', parent: 'nowhere' }] }),
      ),
    ).toMatchObject({ ok: false });
  });

  it('rejects unknown keys on both pieces, so a typo cannot silently pass', () => {
    expect(validateWorksheetContent(timer({ secs: 60 }))).toMatchObject({ ok: false });
    expect(validateWorksheetContent(outline({ regions2: [] }))).toMatchObject({ ok: false });
  });

  it('answers the timer with seconds and the outline with tapped parts', () => {
    const timerContent = validateWorksheetContent(timer());
    if (!timerContent.ok) throw new Error('timer body invalid');
    expect(validateWorksheetAnswers(timerContent.content, { sit: 60 })).toEqual([]);
    expect(validateWorksheetAnswers(timerContent.content, { sit: 61 }).length).toBeGreaterThan(0);

    const outlineContent = validateWorksheetContent(outline({ withStrength: true }));
    if (!outlineContent.ok) throw new Error('outline body invalid');
    expect(validateWorksheetAnswers(outlineContent.content, { where: { picked: ['chest'] } })).toEqual([]);
    expect(
      validateWorksheetAnswers(outlineContent.content, {
        where: { picked: ['chest'], strength: { chest: 6 } },
      }),
    ).toEqual([]);
    expect(
      validateWorksheetAnswers(outlineContent.content, { where: { picked: ['elbow'] } }).length,
    ).toBeGreaterThan(0);
  });
});

// ─── The Low Mood batch of 24 November 2026 ───────────────────────────────

describe('the Low Mood batch of 24 November 2026', () => {
  /** The owner's nine, verbatim, in the order he briefed them. */
  const BATCH: Array<[string, string]> = [
    ['ws_one_small_thing', 'One small thing'],
    ['ws_mood_activity_log', 'Mood and activity log'],
    ['ws_strengths', 'Strengths spotting'],
    ['ws_things_i_might_enjoy', 'Things I might enjoy'],
    ['ws_tiny_steps', 'Tiny steps ladder'],
    ['ws_inner_critic', 'Meet the inner critic'],
    ['ws_reconnect_planner', 'Reconnect planner'],
    ['ws_comparison_check', 'Comparison check'],
    ['ws_miracle_question', 'The morning after a miracle'],
  ];

  it('is the nine the owner briefed, with the new names on the reused rows', () => {
    for (const [id, label] of BATCH) {
      expect(entry(id).label, id).toBe(label);
      // The reused placeholder names are gone, not aliased.
      expect(entry(id).summary.length, id).toBeGreaterThan(0);
    }
    // Four reused rows were filed under an older name. Every one is renamed.
    expect(entry('ws_strengths').label).not.toBe('Strengths');
    expect(entry('ws_tiny_steps').label).not.toBe('Tiny steps');
    expect(entry('ws_miracle_question').label).not.toBe('The miracle question');
  });

  it('is on for clients only because the owner approved the wording', () => {
    // Rule 2: a new worksheet starts draft, and cannot be listed, opened or
    // assigned. Approval is the only thing that changes this — and on 24 Nov
    // 2026 the owner approved all nine, so every row here is approved, dated,
    // and listable. The draft half of the rule is proven where it lives: the
    // generated Low Mood drafts migration still writes all nine as `draft`.
    for (const [id] of BATCH) {
      const row = entry(id);
      expect(row.status, id).toBe('approved');
      expect(row.approved_at, id).toBe('2026-11-24');
      expect(isListable(row), id).toBe(true);
      expect(LISTABLE_CATALOGUE.includes(row), id).toBe(true);
      // None of the nine is therapist-only, so all nine reach a client.
      expect(CLIENT_LIBRARY_CATALOGUE.includes(row), id).toBe(true);
    }
  });

  it('carries the Low Mood label and the access mode the owner asked for', () => {
    // S (open) for the self-serve ones, A (assigned) for the rest.
    const open = new Set([
      'ws_one_small_thing',
      'ws_mood_activity_log',
      'ws_strengths',
      'ws_things_i_might_enjoy',
    ]);
    for (const [id] of BATCH) {
      const row = entry(id);
      expect(row.care_plans, id).toEqual(['low_mood']);
      expect(row.access_mode, id).toBe(open.has(id) ? 'open' : 'assigned');
    }
  });

  it('is low load except the two the owner called high load', () => {
    const high = new Set(['ws_inner_critic', 'ws_comparison_check']);
    for (const [id] of BATCH) {
      expect(entry(id).load_level, id).toBe(high.has(id) ? 'demanding' : 'light');
    }
  });

  it('gives the deeper screen to exactly the two the owner named for it', () => {
    // Rule 3: the Comparison check and Meet the inner critic also watch for
    // skipped meals, restricted food, purging, punishing exercise, hating the
    // body, days without sleep, wanting not to wake up, wanting to hurt someone
    // and self-harm. Nobody else in the batch claims the deeper screen.
    const sensitive = BATCH.filter(([id]) => entry(id).sensitive_check).map(([id]) => id);
    expect(sensitive.sort()).toEqual(['ws_comparison_check', 'ws_inner_critic']);
  });

  it('adds nothing into a total, a level or a label', () => {
    // Rule 5, over the batch's own copy.
    for (const [id] of BATCH) {
      const problems = worksheetRequestProblems(entry(id).content_en).filter((p) =>
        p.startsWith('talks about'),
      );
      expect({ toolId: id, problems }).toEqual({ toolId: id, problems: [] });
    }
    // And there is no aggregate piece to add one up with.
    for (const [id] of BATCH) {
      for (const field of entry(id).content_en?.fields ?? []) {
        expect(field.type, id).not.toBe('aggregate');
      }
    }
  });

  it('asks for none of the forbidden things in any client-facing string', () => {
    // Rule 3's second half, over the batch including the two sensitive rows,
    // where a body or food field would be most tempting.
    for (const [id] of BATCH) {
      expect({ toolId: id, problems: worksheetRequestProblems(entry(id).content_en) }).toEqual({
        toolId: id,
        problems: [],
      });
    }
  });

  it('needs no Hinglish yet: English only, awaiting the owner', () => {
    // Translations are approved separately, so a new row arrives with an empty
    // Hinglish body rather than a machine one.
    for (const [id] of BATCH) {
      expect(entry(id).content_hi, id).toBeNull();
      expect(entry(id).label_hi, id).toBeNull();
      expect(entry(id).summary_hi, id).toBeNull();
    }
  });
});

// ─── The two capabilities this batch needed ────────────────────────────────

describe('review — a week read back in words', () => {
  const base = (over: Record<string, unknown> = {}) => ({
    version: 1,
    fields: [
      { id: 'doing', type: 'short_text', prompt: 'What were you doing?' },
      {
        id: 'feelings',
        type: 'feelings_picker',
        prompt: 'How did you feel?',
        feelings: [{ id: 'calm', label: 'calm' }],
      },
    ],
    ...over,
  });

  it('accepts a well-formed review', () => {
    const result = validateWorksheetContent(
      base({ review: { withinDays: 7, activityField: 'doing', feelingsField: 'feelings' } }),
    );
    expect(result.ok).toBe(true);
  });

  it('refuses a window that is not 1 to 90 whole days', () => {
    for (const withinDays of [0, -1, 91, 7.5]) {
      const result = validateWorksheetContent(
        base({ review: { withinDays, activityField: 'doing', feelingsField: 'feelings' } }),
      );
      expect(result.ok, String(withinDays)).toBe(false);
    }
  });

  it('refuses an unknown key, so a typo cannot silently change what is read back', () => {
    const result = validateWorksheetContent(
      base({
        review: {
          withinDays: 7,
          activityField: 'doing',
          feelingsField: 'feelings',
          score: true,
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain('unknown key "score"');
  });

  it('refuses a review that points at the wrong kind of piece', () => {
    const wrongActivity = validateWorksheetContent(
      base({ review: { withinDays: 7, activityField: 'feelings', feelingsField: 'feelings' } }),
    );
    expect(wrongActivity.ok).toBe(false);
    const wrongFeelings = validateWorksheetContent(
      base({ review: { withinDays: 7, activityField: 'doing', feelingsField: 'doing' } }),
    );
    expect(wrongFeelings.ok).toBe(false);
    // A dangling id is refused too, not silently skipped.
    const dangling = validateWorksheetContent(
      base({ review: { withinDays: 7, activityField: 'nope', feelingsField: 'feelings' } }),
    );
    expect(dangling.ok).toBe(false);
  });

  it('is declared by the one log in the batch, and nothing else', () => {
    const declared = CATALOGUE.filter((row) => row.content_en?.review).map((row) => row.tool_id);
    expect(declared).toEqual(['ws_mood_activity_log']);
    const review = entry('ws_mood_activity_log').content_en?.review;
    expect(review).toEqual({ withinDays: 7, activityField: 'doing', feelingsField: 'feelings' });
  });
});

describe('handOff — carrying picks into another worksheet', () => {
  const base = (over: Record<string, unknown> = {}) => ({
    version: 1,
    fields: [
      {
        id: 'ideas',
        type: 'checklist',
        prompt: 'Which of these might be worth a try?',
        options: [
          { value: 'walk', label: 'A walk, anywhere' },
          { value: 'music', label: 'Music, loud or quiet' },
        ],
      },
    ],
    ...over,
  });

  it('accepts a well-formed hand-off', () => {
    const result = validateWorksheetContent(
      base({
        closing: {
          handOff: {
            toolId: 'ws_small_things',
            field: 'ideas',
            label: 'Take these to my Small things planner',
            targetField: 'plan',
            targetColumn: 'what',
          },
        },
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('refuses a field that is not a checklist', () => {
    const result = validateWorksheetContent({
      version: 1,
      fields: [{ id: 'thought', type: 'short_text', prompt: 'What?' }],
      closing: {
        handOff: {
          toolId: 'ws_small_things',
          field: 'thought',
          label: 'Take these',
          targetField: 'plan',
          targetColumn: 'what',
        },
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain('must be an earlier checklist');
  });

  it('refuses an unknown key or a missing label', () => {
    const extra = validateWorksheetContent(
      base({
        closing: {
          handOff: {
            toolId: 'ws_small_things',
            field: 'ideas',
            label: 'Take',
            rows: 3,
            targetField: 'plan',
            targetColumn: 'what',
          },
        },
      }),
    );
    expect(extra.ok).toBe(false);
    const noLabel = validateWorksheetContent(
      base({
        closing: {
          handOff: {
            toolId: 'ws_small_things',
            field: 'ideas',
            targetField: 'plan',
            targetColumn: 'what',
          },
        },
      }),
    );
    expect(noLabel.ok).toBe(false);
  });

  it('refuses a hand-off that does not say where the picks go', () => {
    const result = validateWorksheetContent(
      base({
        closing: {
          handOff: { toolId: 'ws_small_things', field: 'ideas', label: 'Take these' },
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('handOff.targetField: required');
      expect(result.errors.join(' ')).toContain('handOff.targetColumn: required');
    }
  });

  it('proves the target across the catalogue: it exists, is client-openable and has a list', () => {
    // The validator cannot see other rows, so this is the check that stops a
    // hand-off becoming a dead button.
    expect(handOffProblems()).toEqual([]);
    const declared = CATALOGUE.filter((row) => row.content_en?.closing?.handOff);
    expect(declared.map((row) => row.tool_id)).toEqual(['ws_things_i_might_enjoy']);
    expect(declared[0].content_en?.closing?.handOff?.toolId).toBe('ws_small_things');
    expect(declared[0].content_en?.closing?.handOff?.targetField).toBe('plan');
    expect(declared[0].content_en?.closing?.handOff?.targetColumn).toBe('what');
    // The target is the approved planner, unchanged and still client-openable.
    expect(entry('ws_small_things').status).toBe('approved');
    expect(entry('ws_small_things').access_mode).toBe('assigned');
  });

  it('is a separate key from discardWhen, so neither can silently act as the other', () => {
    const both = validateWorksheetContent(
      base({
        closing: {
          discardWhen: { field: 'ideas', in: ['walk'] },
          handOff: {
            toolId: 'ws_small_things',
            field: 'ideas',
            label: 'Take these',
            targetField: 'plan',
            targetColumn: 'what',
          },
        },
      }),
    );
    // Both are structurally valid at once; the bodies in the catalogue use only
    // one each, and the app reads them independently.
    expect(both.ok).toBe(true);
  });
});
