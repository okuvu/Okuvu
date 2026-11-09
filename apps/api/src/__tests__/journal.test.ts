import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    journalEntry: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    // Step 4 — the flag writer (lib/safety-flags.ts) is REAL in this suite, so
    // these are the delegates it touches. Mocking the flag writer instead would
    // let every test pass while no flag was ever written.
    safetyFlag: { create: vi.fn() },
    therapistClient: { findMany: vi.fn() },
    safetyState: { findUnique: vi.fn() },
  },
}));

// The check itself is covered by its own suite (safety-check.test.ts); here the
// routes' USE of its verdict is what is under test.
const mockCheckClientText = vi.hoisted(() => vi.fn());
vi.mock('../lib/safety-check.js', () => ({
  checkClientText: mockCheckClientText,
  answersToText: () => '',
}));

vi.mock('../lib/email.js', () => ({
  sendSafetyAlertEmail: vi.fn().mockResolvedValue(undefined),
}));

// The final safety review of AI-written text. Default: approved.
const mockA9PostReview = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    decision: 'APPROVED',
    violation_type: null,
    confidence: 'high',
    notes: null,
  }),
);
vi.mock('../agents/a9-post/agent.js', () => ({ a9PostReview: mockA9PostReview }));

/** A clean verdict unless a test says otherwise. */
const SAFE = {
  level: 'S0' as const,
  flagged: false,
  showHelp: false,
  helpOffer: false,
  recheck: false,
  degraded: false,
  reason: 'classifier',
};
beforeEach(() => {
  mockCheckClientText.mockResolvedValue(SAFE);
  mockA9PostReview.mockResolvedValue({
    decision: 'APPROVED',
    violation_type: null,
    confidence: 'high',
    notes: null,
  });
});

const mockGenerateJournalPrompt = vi.hoisted(() => vi.fn());

vi.mock('../agents/journal-prompt/agent.js', () => ({
  generateJournalPrompt: mockGenerateJournalPrompt,
}));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

describe('POST /journal', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  describe('positive — valid entry', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      vi.mocked(prisma.journalEntry.create).mockResolvedValue({
        id: 'entry-1',
        user_id: MOCK_USER_ID,
        emotion: 'anxious',
        intensity: 3,
        content: 'Feeling a bit overwhelmed today.',
        created_at: new Date(),
        shared_with_therapist: false,
        shared_at: null,
        unshared_at: null,
      });
      app = buildApp();
    });

    it('returns 201 with success and id for valid entry', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/journal',
        payload: { emotion: 'anxious', intensity: 3, content: 'Feeling a bit overwhelmed today.' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.id).toBe('entry-1');
    });

    it('accepts all 8 valid emotions', async () => {
      const emotions = ['anxious', 'sad', 'angry', 'overwhelmed', 'numb', 'calm', 'hopeful', 'other'];
      for (const emotion of emotions) {
        const response = await app.inject({
          method: 'POST',
          url: '/journal',
          payload: { emotion, intensity: 3, content: `Test entry for ${emotion}` },
        });
        expect(response.statusCode).toBe(201);
      }
    });

    it('accepts boundary intensity values 1 and 5', async () => {
      const r1 = await app.inject({
        method: 'POST',
        url: '/journal',
        payload: { emotion: 'calm', intensity: 1, content: 'Barely there.' },
      });
      expect(r1.statusCode).toBe(201);

      const r5 = await app.inject({
        method: 'POST',
        url: '/journal',
        payload: { emotion: 'angry', intensity: 5, content: 'Extremely angry.' },
      });
      expect(r5.statusCode).toBe(201);
    });

    it('calls prisma create with correct data', async () => {
      const prisma = await importMocks();

      await app.inject({
        method: 'POST',
        url: '/journal',
        payload: { emotion: 'sad', intensity: 2, content: 'A quiet kind of sadness.' },
      });

      expect(vi.mocked(prisma.journalEntry.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            user_id: MOCK_USER_ID,
            emotion: 'sad',
            intensity: 2,
            content: 'A quiet kind of sadness.',
          }),
          select: { id: true },
        }),
      );
    });

    it('trims content before saving', async () => {
      const prisma = await importMocks();

      await app.inject({
        method: 'POST',
        url: '/journal',
        payload: { emotion: 'calm', intensity: 1, content: '  Some content with spaces  ' },
      });

      expect(vi.mocked(prisma.journalEntry.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            content: 'Some content with spaces',
          }),
        }),
      );
    });
  });

  // The client's complaint that made this change: Save stayed disabled until a
  // mood was picked. Writing is the point of a journal; the mood chips are a
  // helper, so content alone must be enough.
  describe('positive — mood and intensity are optional (journaling only needs words)', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      vi.mocked(prisma.journalEntry.create).mockResolvedValue({ id: 'entry-words-only' } as any);
      app = buildApp();
    });

    it('saves an entry with no emotion and no intensity', async () => {
      const prisma = await importMocks();

      const response = await app.inject({
        method: 'POST',
        url: '/journal',
        payload: { content: 'Just needed to put this somewhere.' },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        success: true,
        id: 'entry-words-only',
        safety: { showHelp: false, helpOffer: false },
      });
      expect(vi.mocked(prisma.journalEntry.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            user_id: MOCK_USER_ID,
            emotion: null,
            intensity: null,
            content: 'Just needed to put this somewhere.',
          }),
        }),
      );
    });

    it('treats explicit nulls the same as absent fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/journal',
        payload: { emotion: null, intensity: null, content: 'Blank mood, real words.' },
      });

      expect(response.statusCode).toBe(201);
    });

    it('still rejects a blank entry — the words are the required part', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/journal',
        payload: { content: '   ' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('EMPTY_CONTENT');
    });

    it('still rejects an unknown emotion even when intensity is absent', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/journal',
        payload: { emotion: 'happy', content: 'Test' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_EMOTION');
    });
  });

  describe('negative — invalid emotion', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      app = buildApp();
    });

    it('returns 400 for missing emotion when intensity is sent', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/journal',
        payload: { intensity: 3, content: 'Test' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INTENSITY_WITHOUT_EMOTION');
    });

    it('returns 400 for invalid emotion string', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/journal',
        payload: { emotion: 'happy', intensity: 3, content: 'Test' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_EMOTION');
    });

    it('returns 400 for non-string emotion', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/journal',
        payload: { emotion: 123, intensity: 3, content: 'Test' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_EMOTION');
    });
  });

  describe('negative — invalid intensity', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      app = buildApp();
    });

    it('returns 400 for intensity 0', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/journal',
        payload: { emotion: 'anxious', intensity: 0, content: 'Test' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_INTENSITY');
    });

    it('returns 400 for intensity 6', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/journal',
        payload: { emotion: 'anxious', intensity: 6, content: 'Test' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_INTENSITY');
    });

    it('returns 400 for non-integer intensity', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/journal',
        payload: { emotion: 'anxious', intensity: 2.5, content: 'Test' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_INTENSITY');
    });

    it('returns 201 for an entry with an emotion and no intensity', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.journalEntry.create).mockResolvedValue({ id: 'entry-no-intensity' } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/journal',
        payload: { emotion: 'anxious', content: 'Test' },
      });

      expect(response.statusCode).toBe(201);
      expect(vi.mocked(prisma.journalEntry.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ emotion: 'anxious', intensity: null }),
        }),
      );
    });

    it('returns 400 for non-numeric intensity', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/journal',
        payload: { emotion: 'anxious', intensity: 'abc', content: 'Test' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_INTENSITY');
    });
  });

  describe('negative — empty content', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      app = buildApp();
    });

    it('returns 400 for empty string content', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/journal',
        payload: { emotion: 'calm', intensity: 1, content: '' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('EMPTY_CONTENT');
    });

    it('returns 400 for whitespace-only content', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/journal',
        payload: { emotion: 'calm', intensity: 1, content: '   ' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('EMPTY_CONTENT');
    });

    it('returns 400 for missing content', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/journal',
        payload: { emotion: 'calm', intensity: 1 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('EMPTY_CONTENT');
    });

    it('returns 400 for content exceeding the max length', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/journal',
        payload: { emotion: 'calm', intensity: 1, content: 'x'.repeat(10001) },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('CONTENT_TOO_LONG');
    });

    it('accepts content at exactly the max length', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.journalEntry.create).mockResolvedValue({ id: 'entry-max' } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/journal',
        payload: { emotion: 'calm', intensity: 1, content: 'x'.repeat(10000) },
      });

      expect(response.statusCode).toBe(201);
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
        url: '/journal',
        payload: { emotion: 'calm', intensity: 1, content: 'Test' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
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
        url: '/journal',
        payload: { emotion: 'calm', intensity: 1, content: 'Test' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 for invalid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/journal',
        headers: { authorization: 'Bearer invalid-token' },
        payload: { emotion: 'calm', intensity: 1, content: 'Test' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });
  });
});

describe('POST /journal/prompt', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('returns the generated prompt for a known user', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: MOCK_USER_ID,
      user_memory: null,
    } as any);
    mockGenerateJournalPrompt.mockResolvedValue('What made today different?');
    app = buildApp();

    const response = await app.inject({ method: 'POST', url: '/journal/prompt' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ prompt: 'What made today different?' });
    expect(mockGenerateJournalPrompt).toHaveBeenCalledWith(null);
  });

  it('passes the user_memory relation through to the agent', async () => {
    const prisma = await importMocks();
    const memory = { recurring_themes: ['work stress'], session_count: 2 };
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: MOCK_USER_ID,
      user_memory: memory,
    } as any);
    mockGenerateJournalPrompt.mockResolvedValue('Reflect on your week.');
    app = buildApp();

    await app.inject({ method: 'POST', url: '/journal/prompt' });

    expect(mockGenerateJournalPrompt).toHaveBeenCalledWith(memory);
  });

  it('returns 401 when auth_subject has no User row', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    app = buildApp();

    const response = await app.inject({ method: 'POST', url: '/journal/prompt' });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
    expect(mockGenerateJournalPrompt).not.toHaveBeenCalled();
  });

  describe('auth — bypass disabled', () => {
    beforeEach(() => {
      delete process.env.LOCAL_DEV_BYPASS_AUTH;
      app = buildApp();
    });

    it('returns 401 when no Authorization header', async () => {
      const response = await app.inject({ method: 'POST', url: '/journal/prompt' });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });
  });
});

describe('GET /journal', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  describe('positive — has entries', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
        {
          id: 'entry-3',
          emotion: 'sad',
          intensity: 4,
          content: 'Rough day.',
          created_at: new Date('2026-07-25T22:30:00.000Z'),
        },
        {
          id: 'entry-2',
          emotion: 'calm',
          intensity: 2,
          content: 'Meditation helped.',
          created_at: new Date('2026-07-24T18:00:00.000Z'),
        },
        {
          id: 'entry-1',
          emotion: 'anxious',
          intensity: 3,
          content: 'Interview tomorrow.',
          created_at: new Date('2026-07-23T10:15:00.000Z'),
        },
      ] as any[]);
      app = buildApp();
    });

    it('returns 200 with entries array', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/journal',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.entries).toHaveLength(3);
    });

    it('returns entries in reverse chronological order', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/journal',
      });

      const body = response.json();
      expect(body.entries[0].id).toBe('entry-3');
      expect(body.entries[1].id).toBe('entry-2');
      expect(body.entries[2].id).toBe('entry-1');
    });

    it('returns correct fields for each entry', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/journal',
      });

      const body = response.json();
      const entry = body.entries[0];
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('emotion');
      expect(entry).toHaveProperty('intensity');
      expect(entry).toHaveProperty('content');
      expect(entry).toHaveProperty('created_at');
    });

    it('calls findMany with correct params (take: 30, desc order)', async () => {
      const prisma = await importMocks();

      await app.inject({
        method: 'GET',
        url: '/journal',
      });

      expect(vi.mocked(prisma.journalEntry.findMany)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: MOCK_USER_ID },
          orderBy: { created_at: 'desc' },
          take: 30,
        }),
      );
    });
  });

  describe('positive — empty list', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([] as any);
      app = buildApp();
    });

    it('returns 200 with empty entries array', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/journal',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ entries: [] });
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
        method: 'GET',
        url: '/journal',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('auth — bypass disabled', () => {
    beforeEach(() => {
      delete process.env.LOCAL_DEV_BYPASS_AUTH;
      app = buildApp();
    });

    it('returns 401 when no Authorization header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/journal',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 for invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/journal',
        headers: { authorization: 'Bearer invalid-token' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });
  });
});

describe('POST /journal — Step 4: the same safety check chat runs', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
    vi.mocked(prisma.journalEntry.create).mockResolvedValue({ id: 'entry-crisis' } as any);
    vi.mocked(prisma.safetyFlag.create).mockResolvedValue({
      id: 'flag-1',
      user_id: MOCK_USER_ID,
      level: 'S4',
      occurred_at: new Date('2026-11-09T10:00:00Z'),
    } as any);
    vi.mocked(prisma.therapistClient.findMany).mockResolvedValue([
      { client_label: 'C-01', therapist: { email: 'therapist@example.com', name: 'T' } },
    ] as any);
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('crisis words in an entry: saved, help card, flag with no text, therapist alerted', async () => {
    mockCheckClientText.mockResolvedValue({
      level: 'S4',
      flagged: true,
      showHelp: true,
      degraded: false,
      reason: 'crisis_keyword_floor',
    });
    app = buildApp();

    const content = 'I want to die and I have been thinking about it all night.';
    const response = await app.inject({ method: 'POST', url: '/journal', payload: { content } });

    // Saved, not swallowed.
    expect(response.statusCode).toBe(201);
    expect(response.json().safety).toMatchObject({ showHelp: true });
    expect(vi.mocked((await importMocks()).journalEntry.create)).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ content }) }),
    );

    // Flagged as a journal event, pointing at the row, carrying no words.
    const flagCall = vi.mocked((await importMocks()).safetyFlag.create).mock.calls[0][0] as any;
    expect(flagCall.data).toMatchObject({
      user_id: MOCK_USER_ID,
      level: 'S4',
      source: 'journal_entry',
      subject_kind: 'journal_entry',
      subject_id: 'entry-crisis',
    });
    expect(JSON.stringify(flagCall.data)).not.toContain('thinking about it all night');

    // The same alert email, with no content in it.
    const { sendSafetyAlertEmail } = await import('../lib/email.js');
    expect(vi.mocked(sendSafetyAlertEmail)).toHaveBeenCalledTimes(1);
    const emailArgs = vi.mocked(sendSafetyAlertEmail).mock.calls[0][0] as any;
    expect(emailArgs).toMatchObject({ to: 'therapist@example.com', level: 'S4' });
    expect(JSON.stringify(emailArgs)).not.toContain('thinking about it all night');
  });

  it('treats a check that could not answer as a possible risk, never as safe', async () => {
    mockCheckClientText.mockResolvedValue({
      level: 'S3',
      flagged: true,
      showHelp: true,
      degraded: true,
      reason: 'classifier_error:safety_check_timeout',
    });
    app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/journal',
      payload: { content: 'Everything is fine.' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().safety).toMatchObject({ showHelp: true });
    const flagCall = vi.mocked((await importMocks()).safetyFlag.create).mock.calls[0][0] as any;
    expect(flagCall.data.level).toBe('S3');
  });

  it('does not flag an ordinary entry', async () => {
    app = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/journal',
      payload: { content: 'Long day. Tired but okay.' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().safety).toMatchObject({ showHelp: false, helpOffer: false });
    expect(vi.mocked((await importMocks()).safetyFlag.create)).not.toHaveBeenCalled();
  });
});

describe('POST /journal/prompt — Step 4: AI text passes the final safety review', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID, user_memory: null } as any);
    vi.mocked(prisma.safetyState.findUnique).mockResolvedValue({ safety_state_current: 'S0' } as any);
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('serves the vetted list when the review blocks the generated prompt', async () => {
    mockGenerateJournalPrompt.mockResolvedValue('You should try writing about your anxiety disorder.');
    mockA9PostReview.mockResolvedValue({
      decision: 'BLOCKED',
      violation_type: 'diagnosis_explicit',
      confidence: 'high',
      notes: null,
    });
    app = buildApp();

    const response = await app.inject({ method: 'POST', url: '/journal/prompt' });

    expect(response.statusCode).toBe(200);
    const { prompt } = response.json() as { prompt: string };
    expect(prompt).not.toContain('anxiety disorder');
    expect(prompt.length).toBeGreaterThan(0);
    expect(mockA9PostReview).toHaveBeenCalledTimes(1);
  });

  it('serves the vetted list when the review itself fails', async () => {
    mockGenerateJournalPrompt.mockResolvedValue('What felt heaviest today?');
    mockA9PostReview.mockRejectedValue(new Error('review unavailable'));
    app = buildApp();

    const response = await app.inject({ method: 'POST', url: '/journal/prompt' });

    expect(response.statusCode).toBe(200);
    const { prompt } = response.json() as { prompt: string };
    expect(prompt).not.toBe('What felt heaviest today?');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('shows the reviewed prompt when it is approved', async () => {
    mockGenerateJournalPrompt.mockResolvedValue('What felt heaviest today?');
    app = buildApp();

    const response = await app.inject({ method: 'POST', url: '/journal/prompt' });

    expect(response.statusCode).toBe(200);
    expect((response.json() as any).prompt).toBe('What felt heaviest today?');
  });
});
