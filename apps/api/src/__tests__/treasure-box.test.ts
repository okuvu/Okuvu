import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    treasureNote: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    treasureCollection: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
    },
    safetyFlag: { create: vi.fn() },
    therapistClient: { findMany: vi.fn() },
    safetyRecheck: { create: vi.fn() },
  },
}));

const mockClassifySafety = vi.hoisted(() => vi.fn());
vi.mock('../agents/a1/agent.js', () => ({ classifySafety: mockClassifySafety }));

vi.mock('../lib/email.js', () => ({
  sendSafetyAlertEmail: vi.fn().mockResolvedValue(undefined),
}));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

const note = (overrides: Record<string, unknown> = {}) => ({
  id: 'note-1',
  title: 'A line that helped',
  body: 'Feeling anxious does not mean something bad is about to happen.',
  source: 'journal',
  collection_id: null,
  tags: ['anxious'],
  pinned: false,
  created_at: new Date('2026-11-09T10:00:00Z'),
  updated_at: new Date('2026-11-09T10:00:00Z'),
  shared_with_therapist: false,
  ...overrides,
});

describe('Treasure Box — Step 6A', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
    vi.mocked(prisma.treasureCollection.createMany).mockResolvedValue({ count: 4 } as any);
    vi.mocked(prisma.treasureCollection.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.treasureNote.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.treasureNote.findFirst).mockResolvedValue(null as any);
    vi.mocked(prisma.safetyFlag.create).mockResolvedValue({
      id: 'flag-1',
      user_id: MOCK_USER_ID,
      level: 'S4',
      occurred_at: new Date('2026-11-09T10:00:00Z'),
    } as any);
    vi.mocked(prisma.safetyRecheck.create).mockResolvedValue({ id: 'recheck-1' } as any);
    vi.mocked(prisma.therapistClient.findMany).mockResolvedValue([] as any);
    mockClassifySafety.mockResolvedValue({
      safetyState: 'S0',
      fallbackUsed: false,
      crisis_language_detected: false,
      basis: 'literal',
      signal_strength: 'high',
      notes: null,
    });
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('creates the four "Open when…" collections on the first read, idempotently', async () => {
    const prisma = await importMocks();
    app = buildApp();

    const res = await app.inject({ method: 'GET', url: '/treasure' });

    expect(res.statusCode).toBe(200);
    const args = vi.mocked(prisma.treasureCollection.createMany).mock.calls[0][0] as any;
    expect(args.data).toHaveLength(4);
    expect(args.data.map((row: any) => row.system_key).sort()).toEqual([
      'anxious',
      'low',
      'overwhelmed',
      'win',
    ]);
    // The unique index on (user_id, system_key) is what makes a retried seed
    // harmless; skipping duplicates is the other half.
    expect(args.skipDuplicates).toBe(true);
  });

  it('labels where each note came from, and never trusts an unknown source', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.treasureNote.findMany).mockImplementation((async (args: any) => {
      if (args?.select?.tags && !args?.select?.body) return [];
      return [
        note({ id: 'n-self', source: 'self', pinned: true }),
        note({ id: 'n-journal', source: 'journal' }),
        note({ id: 'n-chat', source: 'chat' }),
        note({ id: 'n-worksheet', source: 'worksheet' }),
        note({ id: 'n-bogus', source: 'made-up' }),
      ];
    }) as any);
    app = buildApp();

    const res = await app.inject({ method: 'GET', url: '/treasure' });
    const body = res.json() as any;
    const byId = Object.fromEntries(body.notes.map((row: any) => [row.id, row.sourceLabel]));

    expect(byId).toMatchObject({
      'n-self': 'Me',
      'n-journal': 'From my journal',
      'n-chat': 'From OKUVU chat',
      'n-worksheet': 'From a worksheet',
      'n-bogus': 'Me',
    });
  });

  it('maps the tag, collection, search and pinned filters onto the query', async () => {
    const prisma = await importMocks();
    app = buildApp();

    await app.inject({
      method: 'GET',
      url: '/treasure?tag=anxious&collectionId=col-1&q=exam&pinned=1',
    });

    const args = vi.mocked(prisma.treasureNote.findMany).mock.calls[0][0] as any;
    expect(args.where).toMatchObject({
      user_id: MOCK_USER_ID,
      collection_id: 'col-1',
      tags: { has: 'anxious' },
      pinned: true,
    });
    expect(args.where.OR).toHaveLength(3);
  });

  it('keeps a note with tags and files it in a collection the client owns', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.treasureCollection.findFirst).mockResolvedValue({ id: 'col-1' } as any);
    vi.mocked(prisma.treasureNote.create).mockResolvedValue({ id: 'note-9' } as any);
    app = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/treasure/notes',
      payload: {
        body: 'The auto driver did not argue about the fare.',
        tags: ['small win', '#small win', '  '],
        collectionId: 'col-1',
        source: 'worksheet',
      },
    });

    expect(res.statusCode).toBe(201);
    const args = vi.mocked(prisma.treasureNote.create).mock.calls[0][0] as any;
    expect(args.data.tags).toEqual(['small win']);
    expect(args.data.source).toBe('worksheet');
    expect(args.data.collection_id).toBe('col-1');
  });

  it('refuses to let a client label a note as coming from their therapist', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.treasureNote.create).mockResolvedValue({ id: 'note-9' } as any);
    app = buildApp();

    await app.inject({
      method: 'POST',
      url: '/treasure/notes',
      payload: { body: 'A note', source: 'therapist' },
    });

    const args = vi.mocked(prisma.treasureNote.create).mock.calls[0][0] as any;
    expect(args.data.source).toBe('self');
  });

  it('screens the note text again when an edit rewrites it', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.treasureNote.findFirst).mockResolvedValue({
      id: 'note-1',
      title: 'Safe',
      body: 'An ordinary note.',
      tags: [],
      source: 'self',
    } as any);
    vi.mocked(prisma.treasureNote.update).mockResolvedValue(note({ body: 'I want to die' }) as any);
    app = buildApp();

    const res = await app.inject({
      method: 'PATCH',
      url: '/treasure/notes/note-1',
      payload: { body: 'I want to die and I have nobody to call.' },
    });

    expect(res.statusCode).toBe(200);
    expect((res.json() as any).safety.showHelp).toBe(true);
    const args = vi.mocked(prisma.treasureNote.update).mock.calls[0][0] as any;
    expect(args.data.safety_flagged).toBe(true);
    expect(args.data.safety_level).toBe('S4');
    expect(vi.mocked(prisma.safetyFlag.create)).toHaveBeenCalledTimes(1);
  });

  it('does not re-screen a pin or a move between collections', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.treasureNote.findFirst).mockResolvedValue({
      id: 'note-1',
      title: null,
      body: 'An ordinary note.',
      tags: ['anxious'],
      source: 'self',
    } as any);
    vi.mocked(prisma.treasureNote.update).mockResolvedValue(note({ pinned: true }) as any);
    app = buildApp();

    const res = await app.inject({
      method: 'PATCH',
      url: '/treasure/notes/note-1',
      payload: { pinned: true },
    });

    expect(res.statusCode).toBe(200);
    expect(mockClassifySafety).not.toHaveBeenCalled();
    const args = vi.mocked(prisma.treasureNote.update).mock.calls[0][0] as any;
    expect(args.data).toMatchObject({ pinned: true });
    expect(args.data.safety_flagged).toBeUndefined();
  });

  it('deletes only the client\'s own note', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.treasureNote.deleteMany).mockResolvedValue({ count: 0 } as any);
    app = buildApp();

    const res = await app.inject({ method: 'DELETE', url: '/treasure/notes/someone-elses' });

    expect(res.statusCode).toBe(404);
    const args = vi.mocked(prisma.treasureNote.deleteMany).mock.calls[0][0] as any;
    expect(args.where).toEqual({ id: 'someone-elses', user_id: MOCK_USER_ID });
  });

  it('"Pick one for me" only ever looks at pinned notes', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.treasureNote.findMany).mockResolvedValue([{ id: 'pinned-1' }] as any);
    vi.mocked(prisma.treasureNote.findFirst).mockResolvedValue(note({ id: 'pinned-1', pinned: true }) as any);
    app = buildApp();

    const res = await app.inject({ method: 'GET', url: '/treasure/pick' });

    expect(res.statusCode).toBe(200);
    expect((res.json() as any).note.id).toBe('pinned-1');
    const args = vi.mocked(prisma.treasureNote.findMany).mock.calls[0][0] as any;
    expect(args.where).toEqual({ user_id: MOCK_USER_ID, pinned: true });
  });

  it('answers honestly when nothing is pinned yet', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.treasureNote.findMany).mockResolvedValue([] as any);
    app = buildApp();

    const res = await app.inject({ method: 'GET', url: '/treasure/pick' });

    expect(res.statusCode).toBe(404);
    expect((res.json() as any).error.code).toBe('NO_PINNED');
  });

  it('a new note is private: the row is created without a share', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.treasureNote.create).mockResolvedValue({ id: 'note-9' } as any);
    app = buildApp();

    await app.inject({ method: 'POST', url: '/treasure/notes', payload: { body: 'Worth keeping' } });

    const args = vi.mocked(prisma.treasureNote.create).mock.calls[0][0] as any;
    expect(args.data.shared_with_therapist).toBeUndefined();
  });
});
