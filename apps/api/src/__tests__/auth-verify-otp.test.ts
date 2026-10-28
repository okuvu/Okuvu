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
  auth_subject: string;
  phone_number: string;
  created_at: Date;
  updated_at: Date;
};

function mockUser(overrides?: Partial<MockUser>): MockUser {
  return {
    id: mockUuid,
    auth_subject: 'dev-bypass-subject-1',
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

  describe('bypass mode — no matching account', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      app = buildApp();
    });

    it('returns 404 NO_ACCOUNT instead of creating a User, when phone_number is provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        payload: { phone_number: '+15550000001' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error.code).toBe('NO_ACCOUNT');

      const prisma = await importMocks();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('returns 404 NO_ACCOUNT instead of creating a User, when phone_number is omitted', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        payload: {},
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error.code).toBe('NO_ACCOUNT');

      const prisma = await importMocks();
      expect(prisma.user.create).not.toHaveBeenCalled();
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

    it('returns 400 and does not update for a malformed phone_number', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        payload: { phone_number: 'not-a-phone-number' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_PHONE_FORMAT');

      const prisma = await importMocks();
      expect(prisma.user.update).not.toHaveBeenCalled();
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
});
