import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    journalEntry: { findMany: vi.fn(), deleteMany: vi.fn() },
    worksheetResponse: { findMany: vi.fn(), deleteMany: vi.fn() },
    treasureNote: { findMany: vi.fn(), deleteMany: vi.fn() },
  },
}));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

describe('GET /me/export/document — a copy a person can read', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.worksheetResponse.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.treasureNote.findMany).mockResolvedValue([] as any);
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('writes one dated block per item, oldest first, with where each came from', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
      {
        id: 'j1',
        emotion: 'low',
        intensity: 4,
        content: 'A quiet sentence about the day.',
        created_at: new Date('2026-11-08T04:00:00Z'),
        shared_with_therapist: false,
      },
    ] as any);
    vi.mocked(prisma.worksheetResponse.findMany).mockResolvedValue([
      {
        id: 'w1',
        worksheet_id: 'ws_energy_audit',
        answers: {
          drains: [{ item: 'Back-to-back classes', how_much: 8 }],
          noticing: 'I need to sleep more.',
        },
        feeling_before: 7,
        feeling_after: 4,
        completed_at: new Date('2026-11-08T06:30:00Z'),
        shared_with_therapist: true,
        worksheet: { label: 'Energy audit' },
      },
    ] as any);
    vi.mocked(prisma.treasureNote.findMany).mockResolvedValue([
      {
        id: 'n1',
        title: 'A line that helped',
        body: 'Feeling anxious does not mean something bad is about to happen.',
        source: 'journal',
        tags: ['anxious'],
        created_at: new Date('2026-11-08T09:15:00Z'),
        shared_with_therapist: false,
      },
    ] as any);
    app = buildApp();

    const res = await app.inject({ method: 'GET', url: '/me/export/document' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');

    const doc = res.body;

    // Plain text, not a computer file.
    expect(doc).not.toContain('{');
    expect(doc).not.toContain('"id"');

    // The three headings the owner asked for, on every block.
    expect(doc).toContain('Journal entry');
    expect(doc).toContain('A quiet sentence about the day.');
    expect(doc).toContain('Shared with my therapist: No');

    expect(doc).toContain('Worksheet: Energy audit');
    expect(doc).toContain('Before: 7/10 · After: 4/10');
    expect(doc).toContain('Shared with my therapist: Yes');
    // The question text, not the field id.
    expect(doc).toContain("What's been draining your energy this week?");
    expect(doc).toContain('Draining: Back-to-back classes');
    expect(doc).not.toContain('"drains"');

    expect(doc).toContain('Treasure Box: A line that helped');
    expect(doc).toContain('Where it came from: From my journal');
    expect(doc).toContain('Tags: anxious');

    // Date order: 8 Nov 09:30 IST journal, 12:00 IST worksheet, 14:45 IST note.
    expect(doc.indexOf('Journal entry')).toBeLessThan(doc.indexOf('Worksheet: Energy audit'));
    expect(doc.indexOf('Worksheet: Energy audit')).toBeLessThan(
      doc.indexOf('Treasure Box: A line that helped'),
    );
  });

  it('says nothing was written rather than handing back an empty file', async () => {
    app = buildApp();

    const res = await app.inject({ method: 'GET', url: '/me/export/document' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Nothing written yet.');
    expect(res.body).toContain('OKUVU — my entries and notes');
  });

  it('asks the api for the client\'s own rows only', async () => {
    const prisma = await importMocks();
    app = buildApp();

    await app.inject({ method: 'GET', url: '/me/export/document' });

    expect((vi.mocked(prisma.journalEntry.findMany).mock.calls[0][0] as any).where).toEqual({
      user_id: MOCK_USER_ID,
    });
    expect((vi.mocked(prisma.worksheetResponse.findMany).mock.calls[0][0] as any).where).toEqual({
      user_id: MOCK_USER_ID,
    });
    expect((vi.mocked(prisma.treasureNote.findMany).mock.calls[0][0] as any).where).toEqual({
      user_id: MOCK_USER_ID,
    });
  });
});

describe('DELETE /me/items/worksheet_response/:id', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('deletes a worksheet answer the client owns, and nothing else', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.worksheetResponse.deleteMany).mockResolvedValue({ count: 1 } as any);
    app = buildApp();

    const res = await app.inject({
      method: 'DELETE',
      url: '/me/items/worksheet_response/w1',
    });

    expect(res.statusCode).toBe(200);
    expect((res.json() as any).deleted).toBe(true);
    const args = vi.mocked(prisma.worksheetResponse.deleteMany).mock.calls[0][0] as any;
    // The user id is in the WHERE, so pointing at someone else's id deletes
    // nothing rather than deleting their answer.
    expect(args.where).toEqual({ id: 'w1', user_id: MOCK_USER_ID });
  });

  it('answers 404 for an answer that is not theirs', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.worksheetResponse.deleteMany).mockResolvedValue({ count: 0 } as any);
    app = buildApp();

    const res = await app.inject({
      method: 'DELETE',
      url: '/me/items/worksheet_response/someone-elses',
    });

    expect(res.statusCode).toBe(404);
  });
});
