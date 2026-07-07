import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    moodLog: {
      findMany: vi.fn(),
    },
  },
}));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const MOCK_FIREBASE_UID = 'mock-firebase-uid-1';

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

describe('GET /progress/mood', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  describe('positive — full check-in history', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      vi.mocked(prisma.moodLog.findMany).mockResolvedValue([
        { date_ist: new Date('2026-06-24T00:00:00.000Z'), mood_value: 4 },
        { date_ist: new Date('2026-06-25T00:00:00.000Z'), mood_value: 3 },
        { date_ist: new Date('2026-06-26T00:00:00.000Z'), mood_value: 5 },
        { date_ist: new Date('2026-06-27T00:00:00.000Z'), mood_value: 2 },
        { date_ist: new Date('2026-06-28T00:00:00.000Z'), mood_value: 4 },
        { date_ist: new Date('2026-06-29T00:00:00.000Z'), mood_value: 3 },
        { date_ist: new Date('2026-06-30T00:00:00.000Z'), mood_value: 4 },
        { date_ist: new Date('2026-07-01T00:00:00.000Z'), mood_value: 5 },
        { date_ist: new Date('2026-07-02T00:00:00.000Z'), mood_value: 1 },
        { date_ist: new Date('2026-07-03T00:00:00.000Z'), mood_value: 3 },
        { date_ist: new Date('2026-07-04T00:00:00.000Z'), mood_value: 4 },
        { date_ist: new Date('2026-07-05T00:00:00.000Z'), mood_value: 5 },
        { date_ist: new Date('2026-07-06T00:00:00.000Z'), mood_value: 2 },
        { date_ist: new Date('2026-07-07T00:00:00.000Z'), mood_value: 4 },
      ] as any[]);
      app = buildApp();
    });

    it('returns all 14 entries for the default window', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/progress/mood',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.entries).toHaveLength(14);
      expect(body.entries[0]).toEqual({ date: '2026-06-24', mood_value: 4 });
      expect(body.entries[13]).toEqual({ date: '2026-07-07', mood_value: 4 });
    });

    it('returns entries sorted ascending by date', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/progress/mood',
      });

      const body = response.json();
      const dates = body.entries.map((e: { date: string }) => e.date);
      expect(dates).toStrictEqual([...dates].sort());
    });
  });

  describe('positive — sparse check-in history', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      vi.mocked(prisma.moodLog.findMany).mockResolvedValue([
        { date_ist: new Date('2026-06-25T00:00:00.000Z'), mood_value: 3 },
        { date_ist: new Date('2026-07-01T00:00:00.000Z'), mood_value: 5 },
        { date_ist: new Date('2026-07-07T00:00:00.000Z'), mood_value: 4 },
      ] as any[]);
      app = buildApp();
    });

    it('returns only the days that were actually logged', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/progress/mood',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.entries).toHaveLength(3);
      expect(body.entries).toEqual([
        { date: '2026-06-25', mood_value: 3 },
        { date: '2026-07-01', mood_value: 5 },
        { date: '2026-07-07', mood_value: 4 },
      ]);
    });

    it('does not include synthetic placeholder entries for missing days', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/progress/mood',
      });

      const body = response.json();
      const allHaveMood = body.entries.every(
        (e: { mood_value: number }) => typeof e.mood_value === 'number',
      );
      expect(allHaveMood).toBe(true);
      const missingDates = body.entries.filter(
        (e: { mood_value: number }) => e.mood_value === 0 || e.mood_value === null,
      );
      expect(missingDates).toHaveLength(0);
    });
  });

  describe('negative — no check-ins', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      vi.mocked(prisma.moodLog.findMany).mockResolvedValue([] as any);
      app = buildApp();
    });

    it('returns a clean empty array, not an error', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/progress/mood',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toEqual({ entries: [] });
    });
  });

  describe('negative — user not found in DB', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      app = buildApp();
    });

    it('returns 401 when firebase_uid has no User row', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/progress/mood',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('validation — days query param', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      app = buildApp();
    });

    it('accepts explicit days=7', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/progress/mood?days=7',
      });

      expect(response.statusCode).toBe(200);
    });

    it('returns 400 for days=0', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/progress/mood?days=0',
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('INVALID_DAYS');
    });

    it('returns 400 for days=366', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/progress/mood?days=366',
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('INVALID_DAYS');
    });

    it('returns 400 for non-numeric days', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/progress/mood?days=abc',
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('INVALID_DAYS');
    });

    it('returns 400 for negative days', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/progress/mood?days=-5',
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('INVALID_DAYS');
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
        url: '/progress/mood',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 for invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/progress/mood',
        headers: { authorization: 'Bearer invalid-token' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });
});
