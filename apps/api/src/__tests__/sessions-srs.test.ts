import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    sessionLog: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_USER_ID = '660e8400-e29b-41d4-a716-446655440001';
const MOCK_SESSION_ID = '770e8400-e29b-41d4-a716-446655440002';

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

function closedSession(overrides?: Partial<{ user_id: string; session_ended_at: Date | null }>) {
  return {
    user_id: MOCK_USER_ID,
    session_ended_at: new Date('2026-07-01T12:00:00Z'),
    ...overrides,
  };
}

describe('PATCH /sessions/:id/srs', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  describe('positive — valid srs_score', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      vi.mocked(prisma.sessionLog.findUnique).mockResolvedValue(closedSession() as any);
      vi.mocked(prisma.sessionLog.update).mockResolvedValue({} as any);
      app = buildApp();
    });

    it('returns 200 and writes session_feedback_score', async () => {
      const prisma = await importMocks();

      const response = await app.inject({
        method: 'PATCH',
        url: `/sessions/${MOCK_SESSION_ID}/srs`,
        payload: { srs_score: 3 },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });

      expect(prisma.sessionLog.update).toHaveBeenCalledWith({
        where: { id: MOCK_SESSION_ID },
        data: { session_feedback_score: 3 },
      });
    });

    it('accepts all valid scores 1 through 4', async () => {
      for (const score of [1, 2, 3, 4]) {
        const response = await app.inject({
          method: 'PATCH',
          url: `/sessions/${MOCK_SESSION_ID}/srs`,
          payload: { srs_score: score },
        });
        expect(response.statusCode).toBe(200);
      }
    });
  });

  describe('negative — invalid srs_score', () => {
    beforeEach(async () => {
      app = buildApp();
    });

    it('returns 400 for score 0 (below minimum)', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/sessions/${MOCK_SESSION_ID}/srs`,
        payload: { srs_score: 0 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('invalid_srs_score');
    });

    it('returns 400 for score 5 (above maximum)', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/sessions/${MOCK_SESSION_ID}/srs`,
        payload: { srs_score: 5 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('invalid_srs_score');
    });

    it('returns 400 for non-integer float', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/sessions/${MOCK_SESSION_ID}/srs`,
        payload: { srs_score: 2.5 },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for string value', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/sessions/${MOCK_SESSION_ID}/srs`,
        payload: { srs_score: 'abc' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when srs_score is missing', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/sessions/${MOCK_SESSION_ID}/srs`,
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when srs_score is null', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/sessions/${MOCK_SESSION_ID}/srs`,
        payload: { srs_score: null },
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

    it('returns 401 with UNAUTHORIZED', async () => {
      const prisma = await importMocks();

      const response = await app.inject({
        method: 'PATCH',
        url: `/sessions/${MOCK_SESSION_ID}/srs`,
        payload: { srs_score: 3 },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
      expect(prisma.sessionLog.update).not.toHaveBeenCalled();
    });
  });

  describe('negative — session not found', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      vi.mocked(prisma.sessionLog.findUnique).mockResolvedValue(null);
      app = buildApp();
    });

    it('returns 404 with SESSION_NOT_FOUND', async () => {
      const prisma = await importMocks();

      const response = await app.inject({
        method: 'PATCH',
        url: `/sessions/${MOCK_SESSION_ID}/srs`,
        payload: { srs_score: 3 },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('session_not_found');
      expect(prisma.sessionLog.update).not.toHaveBeenCalled();
    });
  });

  describe('negative — session belongs to another user', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      vi.mocked(prisma.sessionLog.findUnique).mockResolvedValue(
        closedSession({ user_id: OTHER_USER_ID }) as any,
      );
      app = buildApp();
    });

    it('returns 403 with FORBIDDEN', async () => {
      const prisma = await importMocks();

      const response = await app.inject({
        method: 'PATCH',
        url: `/sessions/${MOCK_SESSION_ID}/srs`,
        payload: { srs_score: 3 },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('forbidden');
      expect(prisma.sessionLog.update).not.toHaveBeenCalled();
    });
  });

  describe('negative — session still active', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      vi.mocked(prisma.sessionLog.findUnique).mockResolvedValue(
        closedSession({ session_ended_at: null }) as any,
      );
      app = buildApp();
    });

    it('returns 409 with SESSION_STILL_ACTIVE', async () => {
      const prisma = await importMocks();

      const response = await app.inject({
        method: 'PATCH',
        url: `/sessions/${MOCK_SESSION_ID}/srs`,
        payload: { srs_score: 3 },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('session_still_active');
      expect(prisma.sessionLog.update).not.toHaveBeenCalled();
    });
  });

  describe('edge — idempotent double-call', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      vi.mocked(prisma.sessionLog.findUnique).mockResolvedValue(closedSession() as any);
      vi.mocked(prisma.sessionLog.update).mockResolvedValue({} as any);
      app = buildApp();
    });

    it('second call with same score overwrites without error', async () => {
      const res1 = await app.inject({
        method: 'PATCH',
        url: `/sessions/${MOCK_SESSION_ID}/srs`,
        payload: { srs_score: 3 },
      });

      const res2 = await app.inject({
        method: 'PATCH',
        url: `/sessions/${MOCK_SESSION_ID}/srs`,
        payload: { srs_score: 3 },
      });

      expect(res1.statusCode).toBe(200);
      expect(res2.statusCode).toBe(200);
      expect(res1.json()).toEqual({ success: true });
      expect(res2.json()).toEqual({ success: true });
    });

    it('second call with different score overwrites the first', async () => {
      const prisma = await importMocks();

      await app.inject({
        method: 'PATCH',
        url: `/sessions/${MOCK_SESSION_ID}/srs`,
        payload: { srs_score: 2 },
      });

      const res2 = await app.inject({
        method: 'PATCH',
        url: `/sessions/${MOCK_SESSION_ID}/srs`,
        payload: { srs_score: 4 },
      });

      expect(res2.statusCode).toBe(200);

      const updateCalls = vi.mocked(prisma.sessionLog.update).mock.calls;
      expect(updateCalls.length).toBe(2);
      expect(updateCalls[1][0]).toEqual(
        expect.objectContaining({
          data: { session_feedback_score: 4 },
        }),
      );
    });
  });

  describe('edge — extra fields in body', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      vi.mocked(prisma.sessionLog.findUnique).mockResolvedValue(closedSession() as any);
      vi.mocked(prisma.sessionLog.update).mockResolvedValue({} as any);
      app = buildApp();
    });

    it('ignores unknown fields and returns 200', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/sessions/${MOCK_SESSION_ID}/srs`,
        payload: { srs_score: 3, extra_field: 'should be ignored' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
    });
  });
});
