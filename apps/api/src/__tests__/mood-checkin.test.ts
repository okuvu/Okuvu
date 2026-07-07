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
    },
  },
}));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

describe('POST /progress/mood/checkin', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
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
      vi.mocked(prisma.moodLog.upsert).mockResolvedValue({
        id: 'log-1',
        user_id: MOCK_USER_ID,
        mood_value: 4,
        date_ist: new Date('2026-07-07T00:00:00.000Z'),
        source: 'user_input',
        created_at: new Date(),
        updated_at: new Date(),
      });
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
          where: { user_id_date_ist: { user_id: MOCK_USER_ID, date_ist: expect.any(String) } },
          create: expect.objectContaining({ mood_value: 3, source: 'user_input' }),
          update: expect.objectContaining({ mood_value: 3, source: 'user_input' }),
        }),
      );
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

    it('returns 401 when firebase_uid has no User row', async () => {
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
