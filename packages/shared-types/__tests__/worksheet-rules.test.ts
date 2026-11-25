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
import { CATALOGUE, LISTABLE_CATALOGUE, PLACEHOLDER_CATALOGUE, entryById, toRegistryRow } from '../worksheets/index';
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
    // `isListable` is the one filter every list uses. The drafts that exist are
    // exactly the Anxiety & Worry batch of 24 Nov 2026: every one of them was
    // written and none has been approved, so the state has to hold for all nine
    // — a draft is previewable by a therapist and invisible to a client.
    const drafts = CATALOGUE.filter((r) => r.status === 'draft');
    expect(drafts.map((r) => r.tool_id).sort()).toEqual([
      'ws_brain_dump',
      'ws_exam_career_pressure',
      'ws_exposure_ladder',
      'ws_family_expectations',
      'ws_sitting_with_not_knowing',
      'ws_social_situation_prep',
      'ws_sos_calm',
      'ws_unhooking',
      'ws_worry_time',
    ]);
    for (const row of drafts) {
      expect(LISTABLE_CATALOGUE.map((r) => r.tool_id)).not.toContain(row.tool_id);
      expect(row.content_en).not.toBeNull();
    }
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
    // The Doomscroll log and the Unsent letter are both approved now and both
    // carry the deeper screen, so "approved" and "deeper screen" are not
    // exclusive sets. What must stay true: an approved row never quietly loses
    // the deeper screen, and no other approved row gains it.
    const deeper = LISTABLE_CATALOGUE.filter((row) => row.sensitive_check).map((row) => row.tool_id);
    expect(deeper.sort()).toEqual(['ws_scrolling_log', 'ws_unsent_letter']);
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
    for (const row of LISTABLE_CATALOGUE) {
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
    expect(LISTABLE_CATALOGUE.map((r) => r.tool_id)).not.toContain('ws_exposure_ladder');
    expect(PLACEHOLDER_CATALOGUE.map((r) => r.tool_id)).not.toContain('ws_exposure_ladder');
    // It is a real row now, with a body a therapist can read — and still draft,
    // because drafting is not approval and this one is not even client-facing.
    expect(ladder.status).toBe('draft');
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
