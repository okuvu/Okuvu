import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    journalEntry: { findFirst: vi.fn(), update: vi.fn() },
    worksheetResponse: { findFirst: vi.fn(), update: vi.fn() },
    treasureNote: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

function sharedRow(shared: boolean) {
  return {
    shared_with_therapist: shared,
    shared_at: shared ? new Date('2026-11-09T10:00:00Z') : new Date('2026-11-09T09:00:00Z'),
    unshared_at: shared ? null : new Date('2026-11-09T11:00:00Z'),
  };
}

/**
 * One switch for every item.
 *
 * The properties these tests pin: every start is private, a share is one
 * UPDATE on the client's own row, and an unshare sets the boolean false in the
 * same statement the portal reads — which is what makes "it disappears
 * straight away" true rather than eventual.
 */
describe('POST /sharing', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    const prisma = await importMocks();
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({ id: 'j1' } as any);
    vi.mocked(prisma.journalEntry.update).mockResolvedValue(sharedRow(true) as any);
    vi.mocked(prisma.worksheetResponse.findFirst).mockResolvedValue({ id: 'w1' } as any);
    vi.mocked(prisma.worksheetResponse.update).mockResolvedValue(sharedRow(true) as any);
    vi.mocked(prisma.treasureNote.findFirst).mockResolvedValue({ id: 't1' } as any);
    vi.mocked(prisma.treasureNote.update).mockResolvedValue(sharedRow(true) as any);
    app = buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
  });

  it('shares a journal entry and answers with the label the app renders', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/sharing',
      payload: { kind: 'journal_entry', id: 'j1', shared: true },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      kind: 'journal_entry',
      id: 'j1',
      shared: true,
      label: 'Shared with my therapist',
    });
  });

  it('writes the share as one update on the client’s own row', async () => {
    const prisma = await importMocks();

    await app.inject({
      method: 'POST',
      url: '/sharing',
      payload: { kind: 'journal_entry', id: 'j1', shared: true },
    });

    const lookup = vi.mocked(prisma.journalEntry.findFirst).mock.calls[0][0] as any;
    expect(lookup.where).toEqual({ id: 'j1', user_id: MOCK_USER_ID });

    const update = vi.mocked(prisma.journalEntry.update).mock.calls[0][0] as any;
    expect(update.where).toEqual({ id: 'j1' });
    expect(update.data).toMatchObject({ shared_with_therapist: true });
    expect(update.data.shared_at).toBeInstanceOf(Date);
  });

  it('stops a share by setting the boolean false, in the same row the portal reads', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.journalEntry.update).mockResolvedValue(sharedRow(false) as any);

    const response = await app.inject({
      method: 'POST',
      url: '/sharing',
      payload: { kind: 'journal_entry', id: 'j1', shared: false },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      shared: false,
      label: 'Private',
    });

    const update = vi.mocked(prisma.journalEntry.update).mock.calls[0][0] as any;
    expect(update.data).toMatchObject({ shared_with_therapist: false });
    expect(update.data.unshared_at).toBeInstanceOf(Date);
    // The grant history is kept rather than erased.
    expect(update.data.shared_at).toBeUndefined();
  });

  it('works for a worksheet answer and a Treasure Box note', async () => {
    const prisma = await importMocks();

    const worksheet = await app.inject({
      method: 'POST',
      url: '/sharing',
      payload: { kind: 'worksheet_response', id: 'w1', shared: true },
    });
    const note = await app.inject({
      method: 'POST',
      url: '/sharing',
      payload: { kind: 'treasure_note', id: 't1', shared: true },
    });

    expect(worksheet.statusCode).toBe(200);
    expect(note.statusCode).toBe(200);
    expect(prisma.worksheetResponse.update).toHaveBeenCalled();
    expect(prisma.treasureNote.update).toHaveBeenCalled();
  });

  it('answers 404 for someone else’s row, and changes nothing', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null as any);

    const response = await app.inject({
      method: 'POST',
      url: '/sharing',
      payload: { kind: 'journal_entry', id: 'not-mine', shared: true },
    });

    expect(response.statusCode).toBe(404);
    expect(prisma.journalEntry.update).not.toHaveBeenCalled();
  });

  it('refuses an unknown kind or a non-boolean shared', async () => {
    const badKind = await app.inject({
      method: 'POST',
      url: '/sharing',
      payload: { kind: 'chat_turn', id: 'x', shared: true },
    });
    const badFlag = await app.inject({
      method: 'POST',
      url: '/sharing',
      payload: { kind: 'journal_entry', id: 'j1', shared: 'yes' },
    });

    expect(badKind.statusCode).toBe(400);
    expect(badFlag.statusCode).toBe(400);
  });
});
