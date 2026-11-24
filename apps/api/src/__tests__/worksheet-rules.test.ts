/**
 * The owner's worksheet rules of 24 Nov 2026 — the parts that live in the API.
 *
 * Three things are pinned here, each named for the rule it defends:
 *
 *   rule 3 — the deeper risk screen runs on the five worksheets that carry
 *            `sensitive_check`, and ONLY on those;
 *   rule 6 — a therapist-only worksheet (the exposure ladder) answers a client
 *            exactly as an unknown id does, on every client route;
 *   rule 1 — the client's care plan changes the ORDER of the Library and is never
 *            sent to the client.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockClassifySafety = vi.hoisted(() => vi.fn());

vi.mock('../agents/a1/agent.js', () => ({ classifySafety: mockClassifySafety }));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    toolRegistryEntry: { findMany: vi.fn(), findUnique: vi.fn() },
    homework: { findMany: vi.fn(), findFirst: vi.fn() },
    worksheetResponse: { create: vi.fn(), findFirst: vi.fn() },
    safetyPlan: { findUnique: vi.fn() },
    safetyState: { findUnique: vi.fn() },
    clinicalConfig: { findUnique: vi.fn() },
  },
}));

import { buildApp } from '../app.js';
import { checkClientText } from '../lib/safety-check.js';
import { entryById, toRegistryRow } from '@okuvu/shared-types/worksheets';

const ORIGINAL_ENV = { ...process.env };
const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

function classified(state: string) {
  return {
    safetyState: state,
    fallbackUsed: false,
    crisis_language_detected: state === 'S4',
    basis: 'literal',
    signal_strength: 'high',
    notes: null,
  };
}

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

// ─── rule 3: the deeper screen ─────────────────────────────────────────────

describe('rule 3 — the deeper screen for the five sensitive worksheets', () => {
  beforeEach(() => {
    mockClassifySafety.mockReset();
    // A clean verdict, so anything flagged below came from the floor.
    mockClassifySafety.mockResolvedValue(classified('S1'));
  });

  it('flags the eating, body, sleep and harm signals at S3 with no model call', async () => {
    const cases: Array<[string, string]> = [
      ["I've been skipping meals all week", 'skipping_meals'],
      ['I keep restricting what I eat', 'restricting_food'],
      ['I made myself sick after dinner', 'making_yourself_sick'],
      ['I went for a run to punish myself for eating', 'exercise_as_punishment'],
      ['I hate my body', 'hating_your_body'],
      ["I haven't slept for three days", 'not_sleeping_for_days'],
      ['Sometimes I want to hurt someone', 'wanting_to_hurt_someone'],
    ];

    for (const [text, concern] of cases) {
      const result = await checkClientText(text, { sensitiveCheck: true });
      expect({ text, level: result.level, flagged: result.flagged, reason: result.reason }).toEqual({
        text,
        level: 'S3',
        flagged: true,
        reason: `sensitive_worksheet_floor:${concern}`,
      });
      // The response is the journal's: flagged means the help card is shown and
      // the therapist is alerted with no content.
      expect(result.showHelp).toBe(true);
    }
    expect(mockClassifySafety).not.toHaveBeenCalled();
  });

  it('raises self-harm and "sleep and not wake up" to the crisis card', async () => {
    for (const text of [
      'I have been self-harming again',
      'I want to go to sleep and not wake up',
    ]) {
      const result = await checkClientText(text, { sensitiveCheck: true });
      expect({ text, level: result.level, showHelp: result.showHelp }).toEqual({
        text,
        level: 'S4',
        showHelp: true,
      });
    }
    expect(mockClassifySafety).not.toHaveBeenCalled();
  });

  it('does NOT run the deeper screen on a worksheet that is not marked for it', async () => {
    // The same sentence, on an ordinary worksheet: the floor says nothing, so the
    // classifier decides. This is what keeps "I skipped lunch" in a stress
    // worksheet from alerting a therapist.
    const result = await checkClientText("I've been skipping meals all week", {
      sensitiveCheck: false,
    });
    expect(result.level).toBe('S1');
    expect(mockClassifySafety).toHaveBeenCalledTimes(1);
  });

  it('leaves the journal exactly as it was — no options means no deeper screen', async () => {
    await checkClientText('I hate my body');
    expect(mockClassifySafety).toHaveBeenCalledTimes(1);
  });

  it('never fires the deeper screen on ordinary sentences', async () => {
    const ordinary = [
      'I skipped breakfast because I was late',
      'I went for a run to clear my head',
      "I haven't slept well this week",
      'My body feels tense before a meeting',
      'I was angry but I did not shout',
    ];
    for (const text of ordinary) {
      const result = await checkClientText(text, { sensitiveCheck: true });
      expect({ text, level: result.level, flagged: result.flagged }).toEqual({
        text,
        level: 'S1',
        flagged: false,
      });
    }
  });
});

// ─── rule 6: the exposure ladder is therapist-only ─────────────────────────

describe('rule 6 — a therapist-only worksheet does not exist for a client', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    const prisma = await importMocks();
    mockClassifySafety.mockReset();
    mockClassifySafety.mockResolvedValue(classified('S1'));
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
    vi.mocked(prisma.homework.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.homework.findFirst).mockResolvedValue(null as any);
    vi.mocked(prisma.safetyPlan.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.safetyState.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.clinicalConfig.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.toolRegistryEntry.findMany).mockResolvedValue([] as any);
    app = buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  function approvedLadderRow() {
    const base = toRegistryRow(entryById('ws_worry_tree')!);
    return {
      ...base,
      tool_id: 'ws_exposure_ladder',
      access_mode: 'therapist_only',
      care_plans: ['all'],
      // Deliberately approved: the refusal must come from the access mode, not
      // from the status, or approving the wording would publish it.
      status: 'approved',
    };
  }

  it('answers a direct open exactly as an unknown id does', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.toolRegistryEntry.findUnique).mockResolvedValue(approvedLadderRow() as any);

    const res = await app.inject({ method: 'GET', url: '/library/ws_exposure_ladder' });

    expect(res.statusCode).toBe(404);
    expect((res.json() as any).error.code).toBe('NOT_FOUND');
  });

  it('refuses a save to it, so it cannot be filled in by a direct POST', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.toolRegistryEntry.findUnique).mockResolvedValue({
      ...approvedLadderRow(),
      load_level: 'light',
      therapy_modality: null,
      therapist_note: null,
      label: 'Exposure ladder',
      summary: 'x',
      section: 'do_what_matters',
      est_minutes: 10,
      library_group: null,
      content_en: toRegistryRow(entryById('ws_worry_tree')!).content_en,
      content_hi: null,
    } as any);

    const res = await app.inject({
      method: 'POST',
      url: '/worksheets/ws_exposure_ladder',
      payload: { answers: { anything: 'hello' } },
    });

    expect(res.statusCode).toBe(404);
    expect(vi.mocked(prisma.worksheetResponse.create)).not.toHaveBeenCalled();
  });

  it('never lists it, and orders the client’s own plan first', async () => {
    const prisma = await importMocks();
    const rows = [
      toRegistryRow(entryById('ws_thought_record')!), // anxiety + low mood
      toRegistryRow(entryById('ws_small_things')!), // low mood
      toRegistryRow(entryById('ws_name_the_feeling')!), // all
    ].map((row) => ({ ...row, library_group: null }));

    vi.mocked(prisma.toolRegistryEntry.findMany).mockResolvedValue(rows as any);
    vi.mocked(prisma.clinicalConfig.findUnique).mockResolvedValue({ care_plan_id: 'CP1' } as any);

    const res = await app.inject({ method: 'GET', url: '/library' });
    const body = res.json() as any;
    const order = body.cards.map((c: any) => c.toolId);

    // CP1 is Anxiety & Worry: the thought record comes before the low-mood
    // planner, and the "all" card keeps its own order behind them.
    expect(order.indexOf('ws_thought_record')).toBeLessThan(order.indexOf('ws_small_things'));

    // The plan is never serialized — not the id, not a label.
    expect(res.body).not.toContain('anxiety_worry');
    expect(res.body).not.toContain('CP1');
    expect(res.body).not.toContain('Anxiety & Worry');
  });
});
