import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    treasureNote: { create: vi.fn(), findMany: vi.fn() },
    treasureCollection: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    safetyFlag: { create: vi.fn() },
    therapistClient: { findMany: vi.fn() },
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

describe('POST /treasure/notes — Step 4', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
    vi.mocked(prisma.treasureNote.create).mockResolvedValue({ id: 'note-1' } as any);
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

  it('crisis words in a Treasure Box note raise the card, the flag and the alert', async () => {
    const prisma = await importMocks();
    app = buildApp();

    const body = 'I want to die and I have nobody to call.';
    const res = await app.inject({ method: 'POST', url: '/treasure/notes', payload: { body } });

    expect(res.statusCode).toBe(201);
    expect((res.json() as any).safety).toMatchObject({ showHelp: true });

    // Stored, and marked on the row without duplicating the text.
    const createArgs = vi.mocked(prisma.treasureNote.create).mock.calls[0][0] as any;
    expect(createArgs.data).toMatchObject({ safety_flagged: true, safety_level: 'S4' });
    expect(createArgs.data.body).toBe(body);

    const flagArgs = vi.mocked(prisma.safetyFlag.create).mock.calls[0][0] as any;
    expect(flagArgs.data).toMatchObject({
      source: 'treasure_note',
      subject_kind: 'treasure_note',
      subject_id: 'note-1',
    });
    expect(JSON.stringify(flagArgs.data)).not.toContain('nobody to call');

    const { sendSafetyAlertEmail } = await import('../lib/email.js');
    expect(vi.mocked(sendSafetyAlertEmail)).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(sendSafetyAlertEmail).mock.calls[0][0])).not.toContain(
      'nobody to call',
    );
  });

  it('an ordinary note is saved and not flagged', async () => {
    const prisma = await importMocks();
    app = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/treasure/notes',
      payload: { title: 'Worth keeping', body: 'Mum called and we laughed.' },
    });

    expect(res.statusCode).toBe(201);
    expect((res.json() as any).safety).toMatchObject({ showHelp: false, helpOffer: false });
    expect(vi.mocked(prisma.safetyFlag.create)).not.toHaveBeenCalled();
  });

  it('refuses an empty note', async () => {
    const prisma = await importMocks();
    app = buildApp();

    const res = await app.inject({ method: 'POST', url: '/treasure/notes', payload: { body: '  ' } });

    expect(res.statusCode).toBe(400);
    expect(vi.mocked(prisma.treasureNote.create)).not.toHaveBeenCalled();
  });

  it('refuses to file a note into somebody else\'s collection', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.treasureCollection.findFirst).mockResolvedValue(null as any);
    app = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/treasure/notes',
      payload: { body: 'hello', collectionId: 'someone-elses' },
    });

    expect(res.statusCode).toBe(404);
    expect(vi.mocked(prisma.treasureNote.create)).not.toHaveBeenCalled();
  });
});
