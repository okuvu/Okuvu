import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) },
    therapistClient: { updateMany: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) },
    appointment: { findFirst: vi.fn().mockResolvedValue(null) },
    reminder: { findMany: vi.fn().mockResolvedValue([]) },
    homework: { findMany: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) },
    toolRegistryEntry: { findFirst: vi.fn().mockResolvedValue(null) },
    userToolPreference: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

/**
 * The Today card after the owner's Step 6 correction: one main item, then the
 * reminder line and the quote. The main item may be homework the therapist
 * typed in their own words — which Step 5 had dropped by only looking at
 * tool-linked rows.
 */
describe('Today card — typed homework, reminders, quote', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    const prisma = await importMocks();
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: MOCK_USER_ID,
      quote_of_day_enabled: true,
      clinical_config: { care_plan_id: 'CP1', display_abbreviation: null },
    } as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as any);
    vi.mocked(prisma.therapistClient.updateMany).mockResolvedValue({ count: 0 } as any);
    vi.mocked(prisma.therapistClient.findFirst).mockResolvedValue(null as any);
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(null as any);
    vi.mocked(prisma.toolRegistryEntry.findFirst).mockResolvedValue(null as any);
    vi.mocked(prisma.userToolPreference.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.homework.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.homework.findFirst).mockResolvedValue(null as any);
    vi.mocked(prisma.reminder.findMany).mockResolvedValue([
      { id: 'rem-1', schedule_note: 'Practise before bed', tool: null },
    ] as any);
    app = buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
  });

  it('shows typed homework as the one item, with no minutes and no catalogue id', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.homework.findMany).mockResolvedValue([
      {
        id: 'hw-typed',
        tool_id: null,
        description: 'Write down one thing you are looking forward to this week.',
        due_at: null,
        assigned_at: new Date('2026-11-09T08:00:00Z'),
        frequency: null,
        tool: null,
      },
    ] as any);

    const response = await app.inject({ method: 'GET', url: '/users/me/today' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as any;
    expect(body.next).toMatchObject({
      source: 'assigned',
      kind: 'text_homework',
      homeworkId: 'hw-typed',
      toolId: null,
      estMinutes: null,
      repeats: false,
    });
    expect(body.next.label).toBe(
      'Write down one thing you are looking forward to this week.',
    );
  });

  it('prefers a due assignment over the light-exercise suggestion', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.homework.findMany).mockResolvedValue([
      {
        id: 'hw-typed',
        tool_id: null,
        description: 'Two minutes of noticing your breath.',
        due_at: null,
        assigned_at: new Date('2026-11-09T08:00:00Z'),
        frequency: 'once_daily',
        tool: null,
      },
    ] as any);

    const response = await app.inject({ method: 'GET', url: '/users/me/today' });
    const body = response.json() as any;

    expect(body.next.source).toBe('assigned');
    expect(body.next.repeats).toBe(true);
    expect(prisma.toolRegistryEntry.findFirst).not.toHaveBeenCalled();
  });

  it('carries the reminder line and the quote beside the one item', async () => {
    const response = await app.inject({ method: 'GET', url: '/users/me/today' });
    const body = response.json() as any;

    expect(body.reminders).toHaveLength(1);
    expect(body.reminders[0].scheduleNote).toBe('Practise before bed');
    expect(typeof body.quote).toBe('string');
    expect((body.quote as string).length).toBeGreaterThan(0);
  });

  it('does not offer an assignment that was already done today', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.homework.findMany).mockResolvedValue([] as any);

    const response = await app.inject({ method: 'GET', url: '/users/me/today' });
    const body = response.json() as any;

    // The "not again today" rule is expressed in the query the api sends; the
    // card's own answer when nothing is due is the light suggestion (or null).
    expect(body.next?.source ?? 'suggested').toBe('suggested');

    const args = vi.mocked(prisma.homework.findMany).mock.calls.at(-1)![0] as any;
    expect(args.where.OR).toEqual([
      { last_completed_at: null },
      { last_completed_at: { lt: expect.any(Date) } },
    ]);
  });
});
