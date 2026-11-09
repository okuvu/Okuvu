import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { entryById } from '@okuvu/shared-types/worksheets';
import type { CatalogueEntry } from '@okuvu/shared-types/worksheets';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    toolRegistryEntry: { findUnique: vi.fn() },
    homework: { findFirst: vi.fn() },
    worksheetResponse: { create: vi.fn() },
    safetyState: { findUnique: vi.fn() },
    safetyFlag: { create: vi.fn() },
    therapistClient: { findMany: vi.fn() },
  },
}));

// The real check runs (it is the thing under test); only the model verdict is
// stubbed, and the deterministic crisis floor is not stubbed at all.
const mockClassifySafety = vi.hoisted(() => vi.fn());
vi.mock('../agents/a1/agent.js', () => ({ classifySafety: mockClassifySafety }));

vi.mock('../lib/email.js', () => ({
  sendSafetyAlertEmail: vi.fn().mockResolvedValue(undefined),
}));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

function rowFor(toolId: string, overrides: Record<string, unknown> = {}) {
  const entry = entryById(toolId) as CatalogueEntry;
  return {
    tool_id: entry.tool_id,
    kind: 'worksheet',
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
    ...overrides,
  };
}

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

describe('POST /worksheets/:toolId — Step 4', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
    vi.mocked(prisma.homework.findFirst).mockResolvedValue({ id: 'h1' } as any);
    vi.mocked(prisma.worksheetResponse.create).mockResolvedValue({ id: 'resp-1' } as any);
    vi.mocked(prisma.safetyState.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.safetyFlag.create).mockResolvedValue({
      id: 'flag-1',
      user_id: MOCK_USER_ID,
      level: 'S4',
      occurred_at: new Date('2026-11-09T10:00:00Z'),
    } as any);
    vi.mocked(prisma.therapistClient.findMany).mockResolvedValue([
      { client_label: 'C-01', therapist: { email: 'therapist@example.com', name: 'T' } },
    ] as any);
    mockClassifySafety.mockResolvedValue({
      safetyState: 'S1',
      fallbackUsed: false,
      crisis_language_detected: false,
      basis: 'literal',
      signal_strength: 'medium',
      notes: null,
    });
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('crisis words typed into a worksheet answer raise the help card and alert the therapist', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.toolRegistryEntry.findUnique).mockResolvedValue(
      rowFor('ws_three_good_things') as any,
    );
    app = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/worksheets/ws_three_good_things',
      payload: {
        answers: { one: 'I want to die. Nothing good happened.' },
      },
    });

    expect(res.statusCode).toBe(201);
    expect((res.json() as any).safety).toEqual({ showHelp: true });

    // Saved with the flag recorded on the row, and no text on the flag.
    const createArgs = vi.mocked(prisma.worksheetResponse.create).mock.calls[0][0] as any;
    expect(createArgs.data).toMatchObject({ safety_flagged: true, safety_level: 'S4' });

    const flagArgs = vi.mocked(prisma.safetyFlag.create).mock.calls[0][0] as any;
    expect(flagArgs.data).toMatchObject({
      source: 'worksheet_answer',
      subject_kind: 'worksheet_response',
      subject_id: 'resp-1',
      level: 'S4',
    });
    expect(JSON.stringify(flagArgs.data)).not.toContain('Nothing good happened');

    const { sendSafetyAlertEmail } = await import('../lib/email.js');
    expect(vi.mocked(sendSafetyAlertEmail)).toHaveBeenCalledTimes(1);
    const mail = vi.mocked(sendSafetyAlertEmail).mock.calls[0][0] as any;
    expect(mail).toMatchObject({ to: 'therapist@example.com', level: 'S4' });
    expect(JSON.stringify(mail)).not.toContain('Nothing good happened');
  });

  it('finds a disclosure nested inside a row list, not just at the top level', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.toolRegistryEntry.findUnique).mockResolvedValue(
      rowFor('ws_three_good_things') as any,
    );
    app = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/worksheets/ws_three_good_things',
      payload: { answers: { one: [{ item: 'nobody would be better off without me' }] } },
    });

    expect((res.json() as any).safety.showHelp).toBe(true);
  });

  it('refuses a demanding worksheet answered at 8 out of 10, and stores nothing', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.toolRegistryEntry.findUnique).mockResolvedValue(
      rowFor('ws_thought_record') as any,
    );
    app = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/worksheets/ws_thought_record',
      payload: { answers: {}, feelingBefore: 8 },
    });

    expect(res.statusCode).toBe(403);
    expect((res.json() as any).error.code).toBe('DEMANDING_GATE');
    expect(vi.mocked(prisma.worksheetResponse.create)).not.toHaveBeenCalled();
  });

  it('refuses a demanding worksheet with no rating at all', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.toolRegistryEntry.findUnique).mockResolvedValue(
      rowFor('ws_thought_record') as any,
    );
    app = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/worksheets/ws_thought_record',
      payload: { answers: {} },
    });

    expect(res.statusCode).toBe(400);
    expect((res.json() as any).error.code).toBe('FEELING_NOT_GIVEN');
    expect(vi.mocked(prisma.worksheetResponse.create)).not.toHaveBeenCalled();
  });

  it('saves a demanding worksheet answered at or below 5, keeping the rating as "before"', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.toolRegistryEntry.findUnique).mockResolvedValue(
      rowFor('ws_thought_record') as any,
    );
    app = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/worksheets/ws_thought_record',
      payload: { answers: { what_happened: 'Presentation tomorrow' }, feelingBefore: 5 },
    });

    expect(res.statusCode).toBe(201);
    const createArgs = vi.mocked(prisma.worksheetResponse.create).mock.calls[0][0] as any;
    expect(createArgs.data.feeling_before).toBe(5);
    // Not flagged: the check answered S1.
    expect(createArgs.data.safety_flagged).toBe(false);
    expect(vi.mocked(prisma.safetyFlag.create)).not.toHaveBeenCalled();
  });

  it('never lets a client fill in the safety plan themselves', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.toolRegistryEntry.findUnique).mockResolvedValue(
      rowFor('ws_safety_plan') as any,
    );
    app = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/worksheets/ws_safety_plan',
      payload: { answers: { signs: [{ item: 'not sleeping' }] } },
    });

    expect(res.statusCode).toBe(403);
    expect((res.json() as any).error.code).toBe('NOT_A_FORM');
    expect(vi.mocked(prisma.worksheetResponse.create)).not.toHaveBeenCalled();
  });

  it('refuses an unknown answer key rather than storing text no part asked for', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.toolRegistryEntry.findUnique).mockResolvedValue(
      rowFor('ws_three_good_things') as any,
    );
    app = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/worksheets/ws_three_good_things',
      payload: { answers: { not_a_field: 'hello' } },
    });

    expect(res.statusCode).toBe(400);
    expect((res.json() as any).error.code).toBe('UNKNOWN_ANSWER_FIELD');
  });
});
