import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    moodLog: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    // The flag writer and the recheck queue are REAL in this suite, so these are
    // the delegates they touch. Mocking the writers instead would let a test
    // pass while nothing was recorded.
    safetyFlag: { create: vi.fn() },
    therapistClient: { findMany: vi.fn() },
    safetyRecheck: { upsert: vi.fn() },
  },
}));

// The check itself has its own suite; here the route's USE of its verdict is
// what is under test.
const mockCheckClientText = vi.hoisted(() => vi.fn());
vi.mock('../lib/safety-check.js', () => ({
  checkClientText: mockCheckClientText,
  answersToText: () => '',
}));

vi.mock('../lib/email.js', () => ({
  sendSafetyAlertEmail: vi.fn().mockResolvedValue(undefined),
}));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

const SAFE = {
  level: 'S0' as const,
  flagged: false,
  showHelp: false,
  helpOffer: false,
  recheck: false,
  degraded: false,
  reason: 'classifier',
};

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

/** A full row, because the route reads the id back out of it. */
function moodRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'log-1',
    user_id: MOCK_USER_ID,
    mood_value: 4,
    date_ist: new Date('2026-11-22T00:00:00.000Z'),
    source: 'user_input',
    trigger_text: null,
    intensity_0_10: null,
    feeling_words: [],
    feeling_other: null,
    strength_1_5: null,
    shared_with_therapist: false,
    shared_at: null,
    unshared_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('POST /progress/mood/checkin', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    mockCheckClientText.mockResolvedValue(SAFE);
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  describe('positive — valid check-in', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      vi.mocked(prisma.moodLog.upsert).mockResolvedValue(moodRow() as any);
      vi.mocked(prisma.therapistClient.findMany).mockResolvedValue([] as any);
      app = buildApp();
    });

    it('returns 200 with success for valid mood_value', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/progress/mood/checkin',
        payload: { mood_value: 4 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.mood_value).toBe(4);
      expect(body.date).toBeDefined();
      expect(body.id).toBe('log-1');
      // Private by default, stated rather than assumed by the app.
      expect(body.shared).toBe(false);
      expect(body.shareLabel).toBe('Private');
      expect(body.safety).toEqual({ showHelp: false, helpOffer: false });
    });

    it('accepts boundary values 1 and 5', async () => {
      const r1 = await app.inject({
        method: 'POST',
        url: '/progress/mood/checkin',
        payload: { mood_value: 1 },
      });
      expect(r1.statusCode).toBe(200);
      expect(r1.json().mood_value).toBe(1);

      const r5 = await app.inject({
        method: 'POST',
        url: '/progress/mood/checkin',
        payload: { mood_value: 5 },
      });
      expect(r5.statusCode).toBe(200);
      expect(r5.json().mood_value).toBe(5);
    });

    it('calls upsert with correct data', async () => {
      const prisma = await importMocks();

      await app.inject({
        method: 'POST',
        url: '/progress/mood/checkin',
        payload: { mood_value: 3 },
      });

      expect(vi.mocked(prisma.moodLog.upsert)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id_date_ist: { user_id: MOCK_USER_ID, date_ist: expect.any(Date) } },
          create: expect.objectContaining({ mood_value: 3, source: 'user_input' }),
          update: expect.objectContaining({ mood_value: 3, source: 'user_input' }),
        }),
      );
    });

    // Regression: `date_ist` is a Prisma DateTime (@db.Date). Passing the bare
    // "YYYY-MM-DD" string threw PrismaClientValidationError ("Expected
    // ISO-8601 DateTime") on every check-in — a 500 the app surfaced as
    // "Couldn't save your check-in", with no row ever written.
    it('writes date_ist as a UTC-midnight Date, never a date-only string', async () => {
      const prisma = await importMocks();

      await app.inject({
        method: 'POST',
        url: '/progress/mood/checkin',
        payload: { mood_value: 3 },
      });

      const arg = vi.mocked(prisma.moodLog.upsert).mock.calls[0][0] as any;
      expect(arg.create.date_ist).toBeInstanceOf(Date);
      expect(arg.where.user_id_date_ist.date_ist).toBeInstanceOf(Date);
      expect(arg.create.date_ist.toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
    });

    it('stores up to three feeling words', async () => {
      const prisma = await importMocks();

      const response = await app.inject({
        method: 'POST',
        url: '/progress/mood/checkin',
        payload: { mood_value: 2, feeling_words: ['sad', 'tired', 'lonely'] },
      });

      expect(response.statusCode).toBe(200);
      const arg = vi.mocked(prisma.moodLog.upsert).mock.calls[0][0] as any;
      expect(arg.create.feeling_words).toEqual(['sad', 'tired', 'lonely']);
      expect(arg.update.feeling_words).toEqual(['sad', 'tired', 'lonely']);
    });

    it('stores the strength slider, 1-5, in its own column', async () => {
      const prisma = await importMocks();

      for (const strength of [1, 3, 5]) {
        const response = await app.inject({
          method: 'POST',
          url: '/progress/mood/checkin',
          payload: { mood_value: 3, strength_1_5: strength },
        });
        expect(response.statusCode).toBe(200);
      }

      const arg = vi.mocked(prisma.moodLog.upsert).mock.calls[0][0] as any;
      expect(arg.create.strength_1_5).toBe(1);
      // Never the 0-10 column: that scale belongs to the worksheet gate.
      expect(arg.create.intensity_0_10).toBeNull();
    });

    it('leaves the words alone when the body does not mention them', async () => {
      const prisma = await importMocks();

      await app.inject({
        method: 'POST',
        url: '/progress/mood/checkin',
        payload: { mood_value: 4 },
      });

      const arg = vi.mocked(prisma.moodLog.upsert).mock.calls[0][0] as any;
      expect(arg.update).not.toHaveProperty('feeling_words');
      expect(arg.update).not.toHaveProperty('strength_1_5');
    });

    it('clears the words when the client sends an empty list', async () => {
      const prisma = await importMocks();

      await app.inject({
        method: 'POST',
        url: '/progress/mood/checkin',
        payload: { mood_value: 4, feeling_words: [] },
      });

      const arg = vi.mocked(prisma.moodLog.upsert).mock.calls[0][0] as any;
      expect(arg.update.feeling_words).toEqual([]);
    });
  });

  describe('the "Something else" box is screened in the write path', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      vi.mocked(prisma.moodLog.upsert).mockResolvedValue(
        moodRow({ feeling_other: 'worn thin' }) as any,
      );
      vi.mocked(prisma.safetyFlag.create).mockResolvedValue({
        id: 'flag-1',
        user_id: MOCK_USER_ID,
        level: 'S4',
        occurred_at: new Date(),
      } as any);
      vi.mocked(prisma.therapistClient.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.safetyRecheck.upsert).mockResolvedValue({ id: 'recheck-1' } as any);
      app = buildApp();
    });

    it('passes the trimmed text to the same check chat and the journal run', async () => {
      await app.inject({
        method: 'POST',
        url: '/progress/mood/checkin',
        payload: { mood_value: 1, feeling_other: '  worn thin  ' },
      });

      expect(mockCheckClientText).toHaveBeenCalledWith('worn thin');
    });

    it('does not screen the chips — only the free text', async () => {
      const prisma = await importMocks();

      await app.inject({
        method: 'POST',
        url: '/progress/mood/checkin',
        payload: { mood_value: 2, feeling_words: ['hopeless', 'numb'] },
      });

      // The owner's rule: hopeless/numb is a gentle card in the app, never a
      // safety escalation, and nothing is sent to the therapist.
      expect(mockCheckClientText).not.toHaveBeenCalled();
      expect(vi.mocked(prisma.safetyFlag.create)).not.toHaveBeenCalled();
    });

    it('writes a flag with the row pointer and no text when the check flags', async () => {
      const prisma = await importMocks();
      mockCheckClientText.mockResolvedValue({
        ...SAFE,
        level: 'S4',
        flagged: true,
        showHelp: true,
        reason: 'crisis_keyword_floor',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/progress/mood/checkin',
        payload: { mood_value: 1, feeling_other: 'i want to die' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().safety).toEqual({ showHelp: true, helpOffer: false });

      const arg = vi.mocked(prisma.safetyFlag.create).mock.calls[0][0] as any;
      expect(arg.data).toMatchObject({
        user_id: MOCK_USER_ID,
        level: 'S4',
        source: 'mood_log',
        subject_kind: 'mood_log',
        subject_id: 'log-1',
      });
      // Never the client's words.
      expect(JSON.stringify(arg.data)).not.toContain('want to die');
    });

    it('queues a recheck instead of escalating when the check could not run', async () => {
      const prisma = await importMocks();
      mockCheckClientText.mockResolvedValue({
        ...SAFE,
        level: 'S2',
        recheck: true,
        degraded: true,
        helpOffer: true,
        reason: 'classifier_error',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/progress/mood/checkin',
        payload: { mood_value: 1, feeling_other: 'everything at once' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().safety).toEqual({ showHelp: false, helpOffer: true });
      expect(vi.mocked(prisma.safetyFlag.create)).not.toHaveBeenCalled();
      expect(vi.mocked(prisma.safetyRecheck.upsert)).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            surface: 'mood_log',
            subject_kind: 'mood_log',
            subject_id: 'log-1',
          }),
        }),
      );
    });
  });

  describe('negative — the new fields', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      vi.mocked(prisma.moodLog.upsert).mockResolvedValue(moodRow() as any);
      app = buildApp();
    });

    it('rejects four words', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/progress/mood/checkin',
        payload: { mood_value: 3, feeling_words: ['sad', 'tired', 'lonely', 'numb'] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_FEELING_WORDS');
    });

    it('rejects a word that is not in the check-in vocabulary', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/progress/mood/checkin',
        payload: { mood_value: 3, feeling_words: ['i want to die'] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_FEELING_WORDS');
    });

    it('rejects a strength outside 1-5', async () => {
      for (const strength of [0, 6, 2.5, '3']) {
        const response = await app.inject({
          method: 'POST',
          url: '/progress/mood/checkin',
          payload: { mood_value: 3, strength_1_5: strength },
        });
        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe('INVALID_STRENGTH');
      }
    });

    it('rejects a "Something else" longer than the limit', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/progress/mood/checkin',
        payload: { mood_value: 3, feeling_other: 'x'.repeat(121) },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_FEELING_OTHER');
    });
  });

  describe('negative — invalid mood values', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      app = buildApp();
    });

    it('returns 400 for mood_value 0', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/progress/mood/checkin',
        payload: { mood_value: 0 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('INVALID_MOOD_VALUE');
    });

    it('returns 400 for mood_value 6', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/progress/mood/checkin',
        payload: { mood_value: 6 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('INVALID_MOOD_VALUE');
    });

    it('returns 400 for negative mood_value', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/progress/mood/checkin',
        payload: { mood_value: -1 },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for non-integer mood_value', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/progress/mood/checkin',
        payload: { mood_value: 2.5 },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for missing mood_value', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/progress/mood/checkin',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for non-numeric mood_value', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/progress/mood/checkin',
        payload: { mood_value: 'abc' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('negative — user not found', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      app = buildApp();
    });

    it('returns 401 when auth_subject has no User row', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/progress/mood/checkin',
        payload: { mood_value: 3 },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('auth — bypass disabled', () => {
    beforeEach(() => {
      delete process.env.LOCAL_DEV_BYPASS_AUTH;
      app = buildApp();
    });

    it('returns 401 when no Authorization header', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/progress/mood/checkin',
        payload: { mood_value: 3 },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 for invalid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/progress/mood/checkin',
        headers: { authorization: 'Bearer invalid-token' },
        payload: { mood_value: 3 },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });
});

describe('GET /progress/mood', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
    vi.mocked(prisma.moodLog.findMany).mockResolvedValue([
      {
        id: 'log-1',
        date_ist: new Date('2026-11-20T00:00:00.000Z'),
        mood_value: 4,
        feeling_words: ['calm', 'grateful'],
        feeling_other: null,
        strength_1_5: 3,
        shared_with_therapist: true,
      },
      {
        id: 'log-2',
        date_ist: new Date('2026-11-21T00:00:00.000Z'),
        mood_value: 2,
        feeling_words: ['tired'],
        feeling_other: 'worn thin',
        strength_1_5: null,
        shared_with_therapist: false,
      },
    ] as any);
    app = buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('returns the client\'s own entries with the face label, words, strength and share state', async () => {
    const response = await app.inject({ method: 'GET', url: '/progress/mood?days=30' });

    expect(response.statusCode).toBe(200);
    const entries = response.json().entries;
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      id: 'log-1',
      date: '2026-11-20',
      mood_value: 4,
      moodLabel: 'Good',
      feeling_words: ['calm', 'grateful'],
      strength_1_5: 3,
      shared: true,
    });
    // The client reads their own private rows too — the share switch needs to
    // know which ones are still private.
    expect(entries[1]).toMatchObject({
      moodLabel: 'Low',
      shared: false,
      shareLabel: 'Private',
    });
  });
});
