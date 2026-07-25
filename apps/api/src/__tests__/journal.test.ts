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
  },
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

  describe('negative — invalid emotion', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      app = buildApp();
    });

    it('returns 400 for missing emotion', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/journal',
        payload: { intensity: 3, content: 'Test' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_EMOTION');
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

    it('returns 400 for missing intensity', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/journal',
        payload: { emotion: 'anxious', content: 'Test' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_INTENSITY');
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
  });

  describe('negative — user not found', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      app = buildApp();
    });

    it('returns 401 when firebase_uid has no User row', async () => {
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

    it('returns 401 when firebase_uid has no User row', async () => {
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
