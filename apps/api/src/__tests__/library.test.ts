import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';
import { entryById } from '@okuvu/shared-types/worksheets';
import type { CatalogueEntry } from '@okuvu/shared-types/worksheets';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    toolRegistryEntry: { findMany: vi.fn(), findUnique: vi.fn() },
    homework: { findMany: vi.fn(), findFirst: vi.fn() },
    worksheetResponse: { findFirst: vi.fn() },
    // Step 4 — the safety plan instance table and the client's current state.
    safetyPlan: { findUnique: vi.fn() },
    safetyState: { findUnique: vi.fn() },
  },
}));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

/** The real catalogue row, so these tests exercise the approved body itself. */
function rowFor(toolId: string, overrides: Record<string, unknown> = {}) {
  const entry = entryById(toolId) as CatalogueEntry;
  return {
    tool_id: entry.tool_id,
    kind: entry.opens === 'breathing' ? 'group' : entry.opens === 'grounding' ? 'exercise' : 'worksheet',
    status: entry.status,
    label: entry.label,
    summary: entry.summary,
    section: entry.section,
    access_mode: entry.access_mode,
    load_level: entry.load_level,
    est_minutes: entry.est_minutes,
    library_group: entry.library_group ?? null,
    content_en: entry.content_en,
    content_hi: entry.content_hi,
    therapy_modality: entry.therapy_modality,
    therapist_note: entry.therapist_note,
    approved_at: new Date('2026-11-09T00:00:00Z'),
    ...overrides,
  };
}

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

describe('GET /library', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
    vi.mocked(prisma.toolRegistryEntry.findMany).mockResolvedValue([
      rowFor('ws_three_good_things'),
      rowFor('ws_thought_record'),
      rowFor('breathing'),
    ] as any);
    vi.mocked(prisma.homework.findMany).mockResolvedValue([] as any);
    app = buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('asks the database for approved rows only, never drafts or placeholders', async () => {
    const prisma = await importMocks();
    await app.inject({ method: 'GET', url: '/library' });

    const args = vi.mocked(prisma.toolRegistryEntry.findMany).mock.calls[0][0] as any;
    expect(args.where).toEqual({
      status: 'approved',
      kind: { in: ['worksheet', 'exercise', 'group'] },
      library_group: null,
    });
  });

  it('marks an assigned worksheet unavailable until the therapist assigns it', async () => {
    const res = await app.inject({ method: 'GET', url: '/library' });
    const body = res.json() as any;

    const selfServe = body.cards.find((c: any) => c.toolId === 'ws_three_good_things');
    const assigned = body.cards.find((c: any) => c.toolId === 'ws_thought_record');
    expect(selfServe.available).toBe(true);
    expect(assigned.available).toBe(false);
  });

  it('never sends a therapist-facing field to the client', async () => {
    const res = await app.inject({ method: 'GET', url: '/library' });
    const text = res.body;
    expect(text).not.toContain('therapy_modality');
    expect(text).not.toContain('therapist_note');
    expect(text).not.toContain('CBT thought record');
  });

  it('serves English while Hinglish is unapproved', async () => {
    const res = await app.inject({ method: 'GET', url: '/library?lang=hi' });
    expect((res.json() as any).hinglishAvailable).toBe(false);
  });
});

describe('GET /library/:toolId', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
    vi.mocked(prisma.homework.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.homework.findFirst).mockResolvedValue(null as any);
    vi.mocked(prisma.worksheetResponse.findFirst).mockResolvedValue(null as any);
    vi.mocked(prisma.safetyPlan.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.safetyState.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.toolRegistryEntry.findMany).mockResolvedValue([] as any);
    app = buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('opens a self-serve worksheet and strips therapist framing', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.toolRegistryEntry.findUnique).mockResolvedValue(
      rowFor('ws_safety_plan') as any,
    );
    // Safety plan is in_session, so give the client a finished plan first.
    vi.mocked(prisma.safetyPlan.findUnique).mockResolvedValue({ id: 'plan-1' } as any);
    app = buildApp();

    const res = await app.inject({ method: 'GET', url: '/library/ws_safety_plan' });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('therapistPrompt');
    expect(res.body).not.toContain('What thoughts, feelings, situations');
  });

  it('refuses an assigned worksheet with no assignment', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.toolRegistryEntry.findUnique).mockResolvedValue(
      rowFor('ws_thought_record') as any,
    );

    const res = await app.inject({ method: 'GET', url: '/library/ws_thought_record' });
    expect(res.statusCode).toBe(403);
    expect((res.json() as any).error.code).toBe('NOT_ASSIGNED');
  });

  it('opens an assigned worksheet once it is assigned', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.toolRegistryEntry.findUnique).mockResolvedValue(
      rowFor('ws_thought_record') as any,
    );
    vi.mocked(prisma.homework.findFirst).mockResolvedValue({ id: 'h1' } as any);

    // The thought record is demanding, so the gate question has been answered
    // at 4 out of 10 — under the threshold.
    const res = await app.inject({ method: 'GET', url: '/library/ws_thought_record?feelingNow=4' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    expect(body.content.fields.length).toBeGreaterThan(5);
    expect(body.content.intro).toContain('Thoughts can feel like facts');
    expect(body.feelingBefore).toBe(4);
  });

  it('refuses the safety plan before it exists, so a client never gets a blank one', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.toolRegistryEntry.findUnique).mockResolvedValue(
      rowFor('ws_safety_plan') as any,
    );

    const res = await app.inject({ method: 'GET', url: '/library/ws_safety_plan' });
    // Hidden means hidden: an uncreated plan answers exactly as an unknown id
    // does, so a guessed URL cannot discover that a plan is coming.
    expect(res.statusCode).toBe(404);
    expect((res.json() as any).error.code).toBe('NOT_FOUND');
  });

  it('refuses a demanding worksheet at 8 out of 10 and offers grounding instead', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.toolRegistryEntry.findUnique).mockResolvedValue(
      rowFor('ws_thought_record') as any,
    );
    vi.mocked(prisma.homework.findFirst).mockResolvedValue({ id: 'h1' } as any);

    const res = await app.inject({ method: 'GET', url: '/library/ws_thought_record?feelingNow=8' });
    expect(res.statusCode).toBe(403);
    const body = res.json() as any;
    expect(body.error.code).toBe('DEMANDING_GATE');
    expect(body.error.message).toContain('This one works best when things feel a bit steadier');
    expect(body.error.groundingToolId).toBe('grounding_5431');
    // The worksheet body must not travel with the refusal.
    expect(res.body).not.toContain('Thoughts can feel like facts');
  });

  it('refuses a demanding worksheet while the client is in a crisis state, whatever the rating', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.toolRegistryEntry.findUnique).mockResolvedValue(
      rowFor('ws_thought_record') as any,
    );
    vi.mocked(prisma.homework.findFirst).mockResolvedValue({ id: 'h1' } as any);
    vi.mocked(prisma.safetyState.findUnique).mockResolvedValue({ safety_state_current: 'S3' } as any);

    const res = await app.inject({ method: 'GET', url: '/library/ws_thought_record?feelingNow=1' });
    expect(res.statusCode).toBe(403);
    expect((res.json() as any).error.code).toBe('DEMANDING_GATE');
  });

  it('will not open a demanding worksheet without the question being answered', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.toolRegistryEntry.findUnique).mockResolvedValue(
      rowFor('ws_thought_record') as any,
    );
    vi.mocked(prisma.homework.findFirst).mockResolvedValue({ id: 'h1' } as any);

    const res = await app.inject({ method: 'GET', url: '/library/ws_thought_record' });
    expect(res.statusCode).toBe(400);
    expect((res.json() as any).error.code).toBe('FEELING_NOT_GIVEN');
    expect((res.json() as any).error.message).toBe('How strong is what you\'re feeling right now?');
  });

  it('opens a light worksheet with no gate question at all', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.toolRegistryEntry.findUnique).mockResolvedValue(
      rowFor('ws_three_good_things') as any,
    );

    const res = await app.inject({ method: 'GET', url: '/library/ws_three_good_things' });
    expect(res.statusCode).toBe(200);
    expect((res.json() as any).feelingBefore).toBeNull();
  });

  it('returns 404 for a placeholder, exactly as if it did not exist', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.toolRegistryEntry.findUnique).mockResolvedValue(
      rowFor('ws_body_map') as any,
    );

    const res = await app.inject({ method: 'GET', url: '/library/ws_body_map' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for a retired exercise, so guided breathing cannot be opened', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.toolRegistryEntry.findUnique).mockResolvedValue(
      rowFor('grounding_5431', { status: 'retired', tool_id: 'guided_breathing' }) as any,
    );

    const res = await app.inject({ method: 'GET', url: '/library/guided_breathing' });
    expect(res.statusCode).toBe(404);
  });

  it('opens a group card with its children, and never the retired technique', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.toolRegistryEntry.findUnique).mockResolvedValue(
      rowFor('breathing') as any,
    );
    vi.mocked(prisma.toolRegistryEntry.findMany).mockResolvedValue([
      { tool_id: 'box_breathing', label: 'Box Breathing', summary: 'Box breathing — in, hold, out, hold.' },
      { tool_id: 'physiological_sigh', label: 'Physiological Sigh', summary: 'Sigh — two in, one long out.' },
      { tool_id: 'extended_exhale', label: 'Extended Exhale', summary: 'Out slower than in.' },
      { tool_id: 'humming_breath', label: 'Humming Breath', summary: 'Hum out.' },
    ] as any);

    const res = await app.inject({ method: 'GET', url: '/library/breathing' });
    const body = res.json() as any;
    expect(res.statusCode).toBe(200);
    expect(body.kind).toBe('group');
    expect(body.children.map((c: any) => c.toolId)).toEqual([
      'box_breathing',
      'physiological_sigh',
      'extended_exhale',
      'humming_breath',
    ]);
    expect(res.body).not.toContain('guided_breathing');
  });

  it('serves English even when Hinglish is asked for', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.toolRegistryEntry.findUnique).mockResolvedValue(
      rowFor('ws_three_good_things') as any,
    );

    const res = await app.inject({ method: 'GET', url: '/library/ws_three_good_things?lang=hi' });
    const body = res.json() as any;
    expect(body.hinglishAvailable).toBe(false);
    expect(body.content.fields[0].prompt).toBe("What's one thing that went okay today?");
  });
});

describe('GET /library — the safety plan card is hidden until a plan exists', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
    vi.mocked(prisma.toolRegistryEntry.findMany).mockResolvedValue([
      rowFor('ws_three_good_things'),
      rowFor('ws_safety_plan'),
    ] as any);
    vi.mocked(prisma.homework.findMany).mockResolvedValue([] as any);
    app = buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('does not show the card at all when the therapist has not made a plan', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.safetyPlan.findUnique).mockResolvedValue(null as any);

    const res = await app.inject({ method: 'GET', url: '/library' });
    const ids = (res.json() as any).cards.map((c: any) => c.toolId);
    expect(ids).toContain('ws_three_good_things');
    // Hidden, not greyed out: no card, so nothing to tap.
    expect(ids).not.toContain('ws_safety_plan');
  });

  it('shows the card once a plan exists', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.safetyPlan.findUnique).mockResolvedValue({ id: 'plan-1' } as any);

    const res = await app.inject({ method: 'GET', url: '/library' });
    const plan = (res.json() as any).cards.find((c: any) => c.toolId === 'ws_safety_plan');
    expect(plan).toBeTruthy();
    expect(plan.available).toBe(true);
  });
});
