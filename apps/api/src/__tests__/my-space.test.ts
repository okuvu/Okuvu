import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    worksheetResponse: { findMany: vi.fn(), groupBy: vi.fn(), deleteMany: vi.fn() },
    journalEntry: { findMany: vi.fn(), count: vi.fn(), deleteMany: vi.fn() },
    treasureNote: { findMany: vi.fn(), deleteMany: vi.fn() },
  },
}));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

describe('my space — toolkit, Past me, export, delete', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    const prisma = await importMocks();
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
    vi.mocked(prisma.worksheetResponse.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.worksheetResponse.groupBy).mockResolvedValue([] as any);
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.journalEntry.count).mockResolvedValue(0 as any);
    vi.mocked(prisma.treasureNote.findMany).mockResolvedValue([] as any);
    app = buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
  });

  it('My toolkit asks only for worksheets the client marked as helping, and groups them', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.worksheetResponse.findMany).mockResolvedValue([
      { worksheet_id: 'ws_three_good_things', completed_at: new Date('2026-11-09T10:00:00Z'), worksheet: { label: 'Three good things', summary: 'Notice three things.' } },
      { worksheet_id: 'ws_three_good_things', completed_at: new Date('2026-11-08T10:00:00Z'), worksheet: { label: 'Three good things', summary: 'Notice three things.' } },
      { worksheet_id: 'ws_grounding', completed_at: new Date('2026-11-07T10:00:00Z'), worksheet: { label: 'Grounding', summary: null } },
    ] as any);

    const response = await app.inject({ method: 'GET', url: '/toolkit' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: Array<{ toolId: string; timesHelpful: number }> };
    expect(body.items).toHaveLength(2);
    expect(body.items.find((i) => i.toolId === 'ws_three_good_things')?.timesHelpful).toBe(2);

    const args = vi.mocked(prisma.worksheetResponse.findMany).mock.calls[0][0] as any;
    expect(args.where).toEqual({ user_id: MOCK_USER_ID, helped: true });
  });

  it('Past me merges journal and worksheet rows newest first, with filters', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
      { id: 'j1', content: 'A journal sentence', created_at: new Date('2026-11-09T12:00:00Z'), shared_with_therapist: false },
    ] as any);
    vi.mocked(prisma.journalEntry.count).mockResolvedValue(1 as any);
    vi.mocked(prisma.worksheetResponse.findMany).mockResolvedValue([
      {
        id: 'w1',
        worksheet_id: 'ws_thought_record',
        answers: { thought: 'I always fail' },
        completed_at: new Date('2026-11-09T11:00:00Z'),
        shared_with_therapist: true,
        feeling_before: 8,
        feeling_after: 4,
        worksheet: { label: 'Thought record' },
      },
    ] as any);
    vi.mocked(prisma.worksheetResponse.groupBy).mockResolvedValue([
      { worksheet_id: 'ws_thought_record', _count: { _all: 1 } },
    ] as any);

    const response = await app.inject({ method: 'GET', url: '/past-me' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: any[]; filters: any[] };
    expect(body.items.map((item) => item.id)).toEqual(['j1', 'w1']);
    expect(body.items[1]).toMatchObject({
      kind: 'worksheet_response',
      feelingBefore: 8,
      feelingAfter: 4,
      shared: true,
    });
    expect(body.filters[0]).toMatchObject({ toolId: null, label: 'Everything', count: 2 });
  });

  it('Past me filtered by an exercise asks only for that exercise’s rows', async () => {
    const prisma = await importMocks();

    await app.inject({ method: 'GET', url: '/past-me?toolId=ws_thought_record' });

    const args = vi.mocked(prisma.worksheetResponse.findMany).mock.calls[0][0] as any;
    expect(args.where).toEqual({ user_id: MOCK_USER_ID, worksheet_id: 'ws_thought_record' });
    expect(prisma.journalEntry.findMany).not.toHaveBeenCalled();
  });

  it('the export contains the client’s own rows and nothing else', async () => {
    const prisma = await importMocks();

    const response = await app.inject({ method: 'GET', url: '/me/export' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body).toHaveProperty('journalEntries');
    expect(body).toHaveProperty('worksheetResponses');
    expect(body).toHaveProperty('treasureNotes');

    expect((vi.mocked(prisma.journalEntry.findMany).mock.calls[0][0] as any).where).toEqual({
      user_id: MOCK_USER_ID,
    });
    expect((vi.mocked(prisma.treasureNote.findMany).mock.calls[0][0] as any).where).toEqual({
      user_id: MOCK_USER_ID,
    });
  });

  it('deleting an entry is scoped to the client’s own row', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.journalEntry.deleteMany).mockResolvedValue({ count: 1 } as any);

    const response = await app.inject({ method: 'DELETE', url: '/me/items/journal_entry/j1' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ deleted: true });
    expect(vi.mocked(prisma.journalEntry.deleteMany).mock.calls[0][0]).toEqual({
      where: { id: 'j1', user_id: MOCK_USER_ID },
    });
  });

  it('deleting someone else’s entry answers 404 and deletes nothing', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.journalEntry.deleteMany).mockResolvedValue({ count: 0 } as any);

    const response = await app.inject({ method: 'DELETE', url: '/me/items/journal_entry/other' });

    expect(response.statusCode).toBe(404);
    expect(prisma.treasureNote.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes a Treasure Box note and a worksheet answer through the same route', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.treasureNote.deleteMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(prisma.worksheetResponse.deleteMany).mockResolvedValue({ count: 1 } as any);

    const note = await app.inject({ method: 'DELETE', url: '/me/items/treasure_note/t1' });
    const worksheet = await app.inject({ method: 'DELETE', url: '/me/items/worksheet_response/w1' });

    expect(note.statusCode).toBe(200);
    expect(worksheet.statusCode).toBe(200);
  });
});
