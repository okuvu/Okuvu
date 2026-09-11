import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    sessionLog: {
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
    emergencyContact: {
      deleteMany: vi.fn(),
    },
    engagementProfile: {
      deleteMany: vi.fn(),
    },
    clinicalConfig: {
      deleteMany: vi.fn(),
    },
    safetyState: {
      deleteMany: vi.fn(),
    },
    turn: {
      deleteMany: vi.fn(),
    },
    sessionSummary: {
      deleteMany: vi.fn(),
    },
    moodLog: {
      deleteMany: vi.fn(),
    },
  },
}));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const MOCK_FIREBASE_UID = 'mock-firebase-uid-1';

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

function validPayload() {
  return { confirm: true };
}

describe('POST /account/delete', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  describe('positive — valid deletion request', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: MOCK_USER_ID,
        deleted_at: null,
      } as any);
      vi.mocked(prisma.sessionLog.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          emergencyContact: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
          engagementProfile: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
          clinicalConfig: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
          safetyState: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
          turn: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
          sessionSummary: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
          moodLog: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
          sessionLog: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
          user: { update: vi.fn().mockResolvedValue(undefined) },
        };
        return cb(tx);
      });
      app = buildApp();
    });

    it('returns 200 with success', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/account/delete',
        payload: validPayload(),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
    });

    it('calls all delete operations inside transaction', async () => {
      const prisma = await importMocks();

      await app.inject({
        method: 'POST',
        url: '/account/delete',
        payload: validPayload(),
      });

      expect(prisma.$transaction).toHaveBeenCalledOnce();
      const txCallback = vi.mocked(prisma.$transaction).mock.calls[0][0] as Function;
      const tx = {
        emergencyContact: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        engagementProfile: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        clinicalConfig: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        safetyState: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        turn: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        sessionSummary: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        moodLog: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        sessionLog: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        user: { update: vi.fn().mockResolvedValue(undefined) },
      };

      await txCallback(tx);

      expect(tx.emergencyContact.deleteMany).toHaveBeenCalledWith({
        where: { user_id: MOCK_USER_ID },
      });
      expect(tx.engagementProfile.deleteMany).toHaveBeenCalledWith({
        where: { user_id: MOCK_USER_ID },
      });
      expect(tx.clinicalConfig.deleteMany).toHaveBeenCalledWith({
        where: { user_id: MOCK_USER_ID },
      });
      expect(tx.safetyState.deleteMany).toHaveBeenCalledWith({
        where: { user_id: MOCK_USER_ID },
      });
      expect(tx.turn.deleteMany).toHaveBeenCalledWith({
        where: { user_id: MOCK_USER_ID },
      });
      expect(tx.sessionSummary.deleteMany).toHaveBeenCalledWith({
        where: { user_id: MOCK_USER_ID },
      });
      expect(tx.moodLog.deleteMany).toHaveBeenCalledWith({
        where: { user_id: MOCK_USER_ID },
      });
      expect(tx.sessionLog.deleteMany).toHaveBeenCalledWith({
        where: { user_id: MOCK_USER_ID },
      });
      expect(tx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MOCK_USER_ID },
          data: expect.objectContaining({
            phone_number: '',
            deleted_at: expect.any(Date),
          }),
        }),
      );
      expect(tx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            firebase_uid: expect.stringMatching(/^deleted-/),
          }),
        }),
      );
    });
  });

  describe('negative — invalid confirmation flag', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: MOCK_USER_ID,
        deleted_at: null,
      } as any);
      app = buildApp();
    });

    it('returns 400 when confirm is false', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/account/delete',
        payload: { confirm: false },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('CONFIRMATION_REQUIRED');
    });

    it('returns 400 when confirm is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/account/delete',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('CONFIRMATION_REQUIRED');
    });

    it('does NOT call transaction when confirm is false', async () => {
      const prisma = await importMocks();

      await app.inject({
        method: 'POST',
        url: '/account/delete',
        payload: { confirm: false },
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
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
        url: '/account/delete',
        payload: validPayload(),
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('does NOT call transaction when user not found', async () => {
      const prisma = await importMocks();

      await app.inject({
        method: 'POST',
        url: '/account/delete',
        payload: validPayload(),
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('edge — already deleted', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: MOCK_USER_ID,
        deleted_at: new Date('2026-01-01'),
      } as any);
      app = buildApp();
    });

    it('returns 409 with ALREADY_DELETED', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/account/delete',
        payload: validPayload(),
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.error.code).toBe('ALREADY_DELETED');
    });

    it('does NOT call transaction', async () => {
      const prisma = await importMocks();

      await app.inject({
        method: 'POST',
        url: '/account/delete',
        payload: validPayload(),
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('edge — active session exists', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: MOCK_USER_ID,
        deleted_at: null,
      } as any);
      vi.mocked(prisma.sessionLog.findFirst).mockResolvedValue({
        id: 'active-session-id',
      } as any);
      app = buildApp();
    });

    it('returns 409 with ACTIVE_SESSION', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/account/delete',
        payload: validPayload(),
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.error.code).toBe('ACTIVE_SESSION');
      expect(body.error.message).toContain('active session');
    });

    it('does NOT call transaction', async () => {
      const prisma = await importMocks();

      await app.inject({
        method: 'POST',
        url: '/account/delete',
        payload: validPayload(),
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
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
        url: '/account/delete',
        payload: validPayload(),
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 for invalid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/account/delete',
        headers: { authorization: 'Bearer invalid-token' },
        payload: validPayload(),
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });
});
