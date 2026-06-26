import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    engagementProfile: {
      upsert: vi.fn(),
    },
  },
}));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const MOCK_FIREBASE_UID = 'mock-firebase-uid-1';

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

function validPayload(overrides?: Partial<Record<string, boolean>>) {
  return {
    safety_monitoring: true,
    mood_inference: false,
    assessment: false,
    emergency_contact: false,
    ...overrides,
  };
}

describe('POST /users/me/consent', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  describe('positive — valid consent values', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID });
      app = buildApp();
    });

    it('returns 200 and persists all 4 consent fields', async () => {
      const prisma = await importMocks();

      const payload = validPayload({
        safety_monitoring: true,
        mood_inference: true,
        assessment: true,
        emergency_contact: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/users/me/consent',
        payload,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });

      expect(prisma.engagementProfile.upsert).toHaveBeenCalledWith({
        where: { user_id: MOCK_USER_ID },
        create: {
          user_id: MOCK_USER_ID,
          consent_1: true,
          consent_2: true,
          consent_3: true,
          consent_4: true,
        },
        update: {
          consent_1: true,
          consent_2: true,
          consent_3: true,
          consent_4: true,
        },
      });
    });

    it('handles varied boolean combinations', async () => {
      const prisma = await importMocks();

      const payload = validPayload({
        mood_inference: true,
        assessment: false,
        emergency_contact: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/users/me/consent',
        payload,
      });

      expect(response.statusCode).toBe(200);

      expect(prisma.engagementProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            consent_1: true,
            consent_2: true,
            consent_3: false,
            consent_4: true,
          }),
        }),
      );
    });
  });

  describe('negative — safety_monitoring is false', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID });
      app = buildApp();
    });

    it('returns 400 with clear error message', async () => {
      const prisma = await importMocks();

      const payload = validPayload({ safety_monitoring: false });

      const response = await app.inject({
        method: 'POST',
        url: '/users/me/consent',
        payload,
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('INVALID_CONSENT');
      expect(body.error.message).toBe('safety_monitoring must be true');

      expect(prisma.engagementProfile.upsert).not.toHaveBeenCalled();
    });

    it('does NOT silently correct safety_monitoring to true in DB', async () => {
      const prisma = await importMocks();

      const payload = validPayload({ safety_monitoring: false });

      await app.inject({
        method: 'POST',
        url: '/users/me/consent',
        payload,
      });

      expect(prisma.engagementProfile.upsert).not.toHaveBeenCalled();
    });
  });

  describe('edge — idempotent double-call', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID });
      app = buildApp();
    });

    it('succeeds on both calls with same values', async () => {
      const payload = validPayload({
        safety_monitoring: true,
        mood_inference: true,
        assessment: true,
        emergency_contact: true,
      });

      const [res1, res2] = await Promise.all([
        app.inject({ method: 'POST', url: '/users/me/consent', payload }),
        app.inject({ method: 'POST', url: '/users/me/consent', payload }),
      ]);

      expect(res1.statusCode).toBe(200);
      expect(res2.statusCode).toBe(200);
      expect(res1.json()).toEqual({ success: true });
      expect(res2.json()).toEqual({ success: true });
    });
  });

  describe('security — user id from auth, not body', () => {
    it('ignores user_id even if sent in request body', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID });
      app = buildApp();

      const payload = validPayload({ safety_monitoring: true });
      const response = await app.inject({
        method: 'POST',
        url: '/users/me/consent',
        payload: { ...payload, user_id: 'evil-user-id' },
      });

      expect(response.statusCode).toBe(200);

      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { firebase_uid: 'mock-firebase-uid-1' } }),
      );
    });
  });

  describe('auth — user not found in DB', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      app = buildApp();
    });

    it('returns 401 when firebase_uid has no User row', async () => {
      const prisma = await importMocks();

      const response = await app.inject({
        method: 'POST',
        url: '/users/me/consent',
        payload: validPayload(),
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');

      expect(prisma.engagementProfile.upsert).not.toHaveBeenCalled();
    });
  });

  describe('bypass disabled — 401 without auth', () => {
    beforeEach(() => {
      delete process.env.LOCAL_DEV_BYPASS_AUTH;
      app = buildApp();
    });

    it('returns 401 when no Authorization header', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/users/me/consent',
        payload: validPayload(),
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 for invalid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/users/me/consent',
        headers: { authorization: 'Bearer invalid-token' },
        payload: validPayload(),
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });
});
