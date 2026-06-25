import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const mockUuid = '550e8400-e29b-41d4-a716-446655440000';

type MockUser = {
  id: string;
  firebase_uid: string;
  phone_number: string;
  created_at: Date;
  updated_at: Date;
};

function mockUser(overrides?: Partial<MockUser>): MockUser {
  return {
    id: mockUuid,
    firebase_uid: 'mock-firebase-uid-1',
    phone_number: '+15550000001',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

describe('POST /auth/verify-otp', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  describe('bypass mode — new user', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue(mockUser() as any);
      app = buildApp();
    });

    it('creates a new User row with provided phone_number', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        payload: { phone_number: '+15550000001' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.user_id).toBe(mockUuid);
      expect(body.is_new_user).toBe(true);

      const prisma = await importMocks();
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ phone_number: '+15550000001' }),
        }),
      );
    });

    it('creates a new User row with placeholder phone_number when omitted', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.is_new_user).toBe(true);

      const prisma = await importMocks();
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ phone_number: '+0000000000' }),
        }),
      );
    });
  });

  describe('bypass mode — existing user', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser() as any);
      vi.mocked(prisma.user.update).mockResolvedValue(
        mockUser({ created_at: new Date('2026-01-01'), updated_at: new Date('2026-06-01') }) as any,
      );
      app = buildApp();
    });

    it('returns existing User row without creating a duplicate', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        payload: { phone_number: '+15550000001' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.user_id).toBe(mockUuid);
      expect(body.is_new_user).toBe(false);

      const prisma = await importMocks();
      expect(prisma.user.findUnique).toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('updates phone_number when provided for existing user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        payload: { phone_number: '+15559999999' },
      });

      expect(response.statusCode).toBe(200);

      const prisma = await importMocks();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { phone_number: '+15559999999' },
        }),
      );
    });
  });

  describe('bypass disabled — auth errors', () => {
    beforeEach(() => {
      delete process.env.LOCAL_DEV_BYPASS_AUTH;
      app = buildApp();
    });

    it('returns 401 when no Authorization header', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        payload: {},
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toBe('Missing Authorization header');
    });

    it('returns 401 for malformed token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        headers: { authorization: 'Bearer clearly-invalid-token' },
        payload: {},
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('bypass mode — concurrent requests', () => {
    it('handles concurrent requests for the same new firebase_uid', async () => {
      const prisma = await importMocks();

      const store = new Map<string, MockUser>();

      vi.mocked(prisma.user.findUnique).mockImplementation((async (args: { where: { firebase_uid: string } }) => {
        return store.get(args.where.firebase_uid) ?? null;
      }) as any);

      let createCount = 0;
      vi.mocked(prisma.user.create).mockImplementation((async (args: {
        data: { firebase_uid: string; phone_number: string };
      }) => {
        const uid = args.data.firebase_uid;
        const existing = store.get(uid);
        if (existing) {
          return existing;
        }
        const newUser = mockUser({
          firebase_uid: uid,
          phone_number: args.data.phone_number,
        });
        store.set(uid, newUser);
        createCount++;
        return newUser;
      }) as any);

      app = buildApp();

      const [res1, res2] = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/auth/verify-otp',
          payload: { phone_number: '+15550000001' },
        }),
        app.inject({
          method: 'POST',
          url: '/auth/verify-otp',
          payload: { phone_number: '+15550000001' },
        }),
      ]);

      expect(res1.statusCode).toBe(200);
      expect(res2.statusCode).toBe(200);

      expect(createCount).toBeLessThanOrEqual(1);
    });
  });
});
