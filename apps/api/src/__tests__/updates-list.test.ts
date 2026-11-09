import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    homework: { findMany: vi.fn() },
    treasureNote: { create: vi.fn(), findFirst: vi.fn() },
  },
}));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

function mockNotification(overrides?: Record<string, unknown>) {
  return {
    id: 'ntf-1',
    user_id: MOCK_USER_ID,
    kind: 'homework_assigned',
    title: 'New homework',
    body: 'Write down three things you noticed today.',
    homework_id: 'hw-1',
    appointment_id: null,
    read_at: null,
    created_at: new Date('2026-11-09T09:00:00.000Z'),
    ...overrides,
  };
}

/**
 * Step 7 — the two update kinds that do not come from a therapist's click.
 *
 * "Due today" is derived on read (nothing in this deployment runs on a clock)
 * and "a note from my therapist" is a row the therapist writes but the client
 * only receives through Keep. Both are pinned here because a duplicate row or a
 * lost note is invisible on a phone: the list still renders, just wrongly.
 */
describe('Updates list — new kinds (Step 7)', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as never);
    vi.mocked(prisma.notification.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.notification.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.notification.createMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.homework.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.treasureNote.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.treasureNote.create).mockResolvedValue({ id: 'note-kept-1' } as never);
    vi.mocked(prisma.notification.update).mockResolvedValue({} as never);
    app = buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('derives one "Due today" row per assignment, keyed by assignment and IST day', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.homework.findMany).mockResolvedValue([
      { id: 'hw-1', description: 'Practise the thought record.' },
    ] as never);

    await app.inject({ method: 'GET', url: '/users/me/notifications' });

    const args = vi.mocked(prisma.notification.createMany).mock.calls[0][0] as any;
    expect(args.data).toHaveLength(1);
    expect(args.data[0]).toMatchObject({
      user_id: MOCK_USER_ID,
      kind: 'homework_due_today',
      title: 'Due today',
      body: 'Practise the thought record.',
      homework_id: 'hw-1',
    });
    // Shape is `due_today:<homeworkId>:<YYYY-MM-DD>` — the day is what makes the
    // row idempotent for today and fresh again tomorrow.
    expect(args.data[0].dedupe_key).toMatch(/^due_today:hw-1:\d{4}-\d{2}-\d{2}$/);
    // The unique index on dedupe_key is what makes a re-read harmless.
    expect(args.skipDuplicates).toBe(true);
  });

  it('re-reading produces the same key rather than a second row', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.homework.findMany).mockResolvedValue([
      { id: 'hw-1', description: 'Practise the thought record.' },
    ] as never);

    await app.inject({ method: 'GET', url: '/users/me/notifications' });
    await app.inject({ method: 'GET', url: '/users/me/notifications' });

    const first = (vi.mocked(prisma.notification.createMany).mock.calls[0][0] as any).data[0];
    const second = (vi.mocked(prisma.notification.createMany).mock.calls[1][0] as any).data[0];
    expect(second.dedupe_key).toBe(first.dedupe_key);
  });

  it('asks only for active work that is due today and not already done today', async () => {
    const prisma = await importMocks();

    await app.inject({ method: 'GET', url: '/users/me/notifications' });

    const where = (vi.mocked(prisma.homework.findMany).mock.calls[0][0] as any).where;
    expect(where.client_user_id).toBe(MOCK_USER_ID);
    expect(where.status).toBe('active');
    expect(where.due_at.gte).toBeInstanceOf(Date);
    expect(where.due_at.lte).toBeInstanceOf(Date);
    // A client who did it this morning must not be told it is due.
    expect(where.OR).toEqual([
      { last_completed_at: null },
      { last_completed_at: { lt: expect.any(Date) } },
    ]);
  });

  it('lists unread rows before read ones, newest first inside each group', async () => {
    const prisma = await importMocks();

    await app.inject({ method: 'GET', url: '/users/me/notifications' });

    expect(vi.mocked(prisma.notification.findMany).mock.calls[0][0]).toMatchObject({
      orderBy: [
        { read_at: { sort: 'asc', nulls: 'first' } },
        { created_at: 'desc' },
        { id: 'desc' },
      ],
    });
  });

  it('keeps a waiting note: copies it into the box, marks the update read', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.notification.findFirst).mockResolvedValue(
      mockNotification({
        id: 'ntf-note',
        kind: 'treasure_note_waiting',
        title: 'Your therapist sent you something for your Treasure Box.',
        body: '',
        homework_id: null,
        note_body: 'You handled the review meeting better than you think.',
      }) as never,
    );

    const res = await app.inject({
      method: 'POST',
      url: '/users/me/notifications/ntf-note/keep',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, noteId: 'note-kept-1' });

    const created = vi.mocked(prisma.treasureNote.create).mock.calls[0][0] as any;
    expect(created.data).toMatchObject({
      user_id: MOCK_USER_ID,
      body: 'You handled the review meeting better than you think.',
      source: 'therapist',
      source_ref: 'ntf-note',
    });
    expect(vi.mocked(prisma.notification.update).mock.calls[0][0]).toMatchObject({
      where: { id: 'ntf-note' },
      data: { read_at: expect.any(Date) },
    });
  });

  it('keeping twice returns the same note instead of a second copy', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.notification.findFirst).mockResolvedValue(
      mockNotification({
        id: 'ntf-note',
        kind: 'treasure_note_waiting',
        body: '',
        note_body: 'A line worth keeping.',
        read_at: new Date('2026-11-09T10:00:00.000Z'),
      }) as never,
    );
    vi.mocked(prisma.treasureNote.findFirst).mockResolvedValue({ id: 'note-kept-1' } as never);

    const res = await app.inject({
      method: 'POST',
      url: '/users/me/notifications/ntf-note/keep',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, noteId: 'note-kept-1' });
    expect(prisma.treasureNote.create).not.toHaveBeenCalled();
  });

  it("answers 404 for an update that is not this client's", async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.notification.findFirst).mockResolvedValue(null as never);

    const res = await app.inject({
      method: 'POST',
      url: '/users/me/notifications/someone-elses/keep',
    });

    expect(res.statusCode).toBe(404);
    expect(prisma.treasureNote.create).not.toHaveBeenCalled();
    // The scope is in the query, not in a check afterwards.
    expect(vi.mocked(prisma.notification.findFirst).mock.calls[0][0]).toMatchObject({
      where: { user_id: MOCK_USER_ID, kind: 'treasure_note_waiting' },
    });
  });
});
