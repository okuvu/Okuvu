import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const MOCK_FIREBASE_UID = 'mock-firebase-uid-1';

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

describe('GET/PATCH /settings/language', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    app = buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  describe('GET /settings/language', () => {
    it("returns the user's current language_mode", async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ language_mode: 'mirror' } as never);

      const response = await app.inject({ method: 'GET', url: '/settings/language' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ language_mode: 'mirror' });
    });

    it('returns 401 when the user does not exist', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const response = await app.inject({ method: 'GET', url: '/settings/language' });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('PATCH /settings/language', () => {
    it('updates language_mode to mirror', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);

      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/language',
        payload: { language_mode: 'mirror' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { language_mode: 'mirror' },
      });
    });

    it('updates language_mode to english', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);

      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/language',
        payload: { language_mode: 'english' },
      });

      expect(response.statusCode).toBe(200);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { language_mode: 'english' },
      });
    });

    it('rejects an invalid language_mode value', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/language',
        payload: { language_mode: 'hindi' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_BODY');
    });

    it('rejects a missing language_mode field', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/language',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 401 when the user does not exist', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/language',
        payload: { language_mode: 'mirror' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('auth — 401 without bypass', () => {
    it('returns 401 for GET without an Authorization header', async () => {
      delete process.env.LOCAL_DEV_BYPASS_AUTH;
      const bypassApp = buildApp();

      const response = await bypassApp.inject({ method: 'GET', url: '/settings/language' });

      expect(response.statusCode).toBe(401);
      await bypassApp.close();
    });
  });
});

describe('GET/PATCH /settings/quote-of-day (okuvu-remaining-changes.md O6)', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    app = buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  describe('GET /settings/quote-of-day', () => {
    it("returns the user's current quote_of_day_enabled value", async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ quote_of_day_enabled: true } as never);

      const response = await app.inject({ method: 'GET', url: '/settings/quote-of-day' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ enabled: true });
    });

    it('returns 401 when the user does not exist', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const response = await app.inject({ method: 'GET', url: '/settings/quote-of-day' });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('PATCH /settings/quote-of-day', () => {
    it('enables quote_of_day_enabled', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);

      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/quote-of-day',
        payload: { enabled: true },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { quote_of_day_enabled: true },
      });
    });

    it('disables quote_of_day_enabled', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);

      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/quote-of-day',
        payload: { enabled: false },
      });

      expect(response.statusCode).toBe(200);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { quote_of_day_enabled: false },
      });
    });

    it('rejects a non-boolean enabled value', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/quote-of-day',
        payload: { enabled: 'yes' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_BODY');
    });

    it('returns 401 when the user does not exist', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/quote-of-day',
        payload: { enabled: true },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
