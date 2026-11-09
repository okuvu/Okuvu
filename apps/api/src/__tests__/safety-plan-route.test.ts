import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { entryById } from '@okuvu/shared-types/worksheets';
import type { CatalogueEntry } from '@okuvu/shared-types/worksheets';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    safetyPlan: { findUnique: vi.fn() },
    toolRegistryEntry: { findUnique: vi.fn() },
  },
}));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

function planRow() {
  const entry = entryById('ws_safety_plan') as CatalogueEntry;
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
  };
}

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

describe('GET /safety-plan — the client reads what was made with them', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
    vi.mocked(prisma.toolRegistryEntry.findUnique).mockResolvedValue(planRow() as any);
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('answers NOT_CREATED_YET before a therapist has made one', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.safetyPlan.findUnique).mockResolvedValue(null as any);
    app = buildApp();

    const res = await app.inject({ method: 'GET', url: '/safety-plan' });

    expect(res.statusCode).toBe(404);
    expect((res.json() as any).error.code).toBe('NOT_CREATED_YET');
  });

  it('serves the seven parts, the client\'s words and the central helplines', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.safetyPlan.findUnique).mockResolvedValue({
      answers: {
        signs: [{ item: 'not sleeping' }],
        one_reason: 'my sister',
      },
      therapist_contact: 'Dr Rao, 10am-6pm',
      created_at: new Date('2026-11-09T09:00:00Z'),
      updated_at: new Date('2026-11-09T09:30:00Z'),
    } as any);
    app = buildApp();

    const res = await app.inject({ method: 'GET', url: '/safety-plan' });

    expect(res.statusCode).toBe(200);
    const body = res.json() as any;

    expect(body.parts).toHaveLength(7);
    expect(body.parts.map((p: any) => p.id)).toEqual([
      'signs',
      'on_my_own',
      'people_places',
      'ask_for_help',
      'professional',
      'safer_surroundings',
      'one_reason',
    ]);
    expect(body.answers.one_reason).toBe('my sister');
    expect(body.therapistContact).toBe('Dr Rao, 10am-6pm');

    // Five approved lines, in clinical order, from the one central list.
    expect(body.helplines.map((h: any) => h.name)).toEqual([
      'Tele-MANAS',
      'Vandrevala Foundation',
      'Emergency services',
      'SNEHA, Chennai',
      'iCall (TISS)',
    ]);
    expect(body.helplines[0].phone).toBe('14416');

    // Therapist framing never reaches the client.
    expect(res.body).not.toContain('therapistPrompt');
    expect(res.body).not.toContain('What thoughts, feelings, situations');
    expect(body.closing.buttons[0].label).toBe('Get help now');
  });
});
