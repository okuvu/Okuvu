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

const MOCK_AUTH_SUBJECT = 'dev-bypass-subject-1';

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

describe('GET/PATCH /settings/profile', () => {
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

  describe('GET /settings/profile', () => {
    it("returns the user's profile fields", async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        full_name: 'Jordan Lee',
        email: 'jordan@example.com',
        date_of_birth: new Date('2000-01-15T00:00:00.000Z'),
        gender: 'nonbinary',
      } as never);

      const response = await app.inject({ method: 'GET', url: '/settings/profile' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        full_name: 'Jordan Lee',
        email: 'jordan@example.com',
        date_of_birth: '2000-01-15T00:00:00.000Z',
        gender: 'nonbinary',
      });
    });

    it('returns null date_of_birth when unset', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        full_name: null,
        email: null,
        date_of_birth: null,
        gender: null,
      } as never);

      const response = await app.inject({ method: 'GET', url: '/settings/profile' });

      expect(response.json()).toEqual({
        full_name: null,
        email: null,
        date_of_birth: null,
        gender: null,
      });
    });

    it('returns 401 when the user does not exist', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const response = await app.inject({ method: 'GET', url: '/settings/profile' });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('PATCH /settings/profile', () => {
    it('updates full_name, date_of_birth, and gender', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);

      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/profile',
        payload: { full_name: 'Jordan Lee', date_of_birth: '2000-01-15', gender: 'nonbinary' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          full_name: 'Jordan Lee',
          date_of_birth: new Date('2000-01-15'),
          gender: 'nonbinary',
        },
      });
    });

    it('updates only the fields provided', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);

      await app.inject({
        method: 'PATCH',
        url: '/settings/profile',
        payload: { full_name: 'New Name' },
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { full_name: 'New Name' },
      });
    });

    it('rejects an unparseable date_of_birth', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);

      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/profile',
        payload: { date_of_birth: 'not-a-date' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_DATE');
    });

    it('returns 401 when the user does not exist', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/profile',
        payload: { full_name: 'Jordan Lee' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('rejects a non-string full_name', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);

      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/profile',
        payload: { full_name: 12345 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_FULL_NAME');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects a full_name exceeding the max length', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);

      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/profile',
        payload: { full_name: 'x'.repeat(201) },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('FULL_NAME_TOO_LONG');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects a gender exceeding the max length', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);

      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/profile',
        payload: { gender: 'x'.repeat(101) },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('GENDER_TOO_LONG');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('allows null full_name/gender to clear the field', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);

      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/profile',
        payload: { full_name: null, gender: null },
      });

      expect(response.statusCode).toBe(200);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { full_name: null, gender: null },
      });
    });
  });
});

describe('GET/PATCH /settings/notifications', () => {
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

  describe('GET /settings/notifications', () => {
    it('returns both preference flags', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        appointment_reminders_enabled: true,
        chat_nudges_enabled: false,
      } as never);

      const response = await app.inject({ method: 'GET', url: '/settings/notifications' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        appointment_reminders_enabled: true,
        chat_nudges_enabled: false,
      });
    });

    it('returns 401 when the user does not exist', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const response = await app.inject({ method: 'GET', url: '/settings/notifications' });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('PATCH /settings/notifications', () => {
    it('updates one preference at a time', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);

      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/notifications',
        payload: { chat_nudges_enabled: false },
      });

      expect(response.statusCode).toBe(200);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { chat_nudges_enabled: false },
      });
    });

    it('updates both preferences together', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);

      await app.inject({
        method: 'PATCH',
        url: '/settings/notifications',
        payload: { appointment_reminders_enabled: false, chat_nudges_enabled: true },
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { appointment_reminders_enabled: false, chat_nudges_enabled: true },
      });
    });

    it('rejects an empty body', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/notifications',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_BODY');
    });

    it('rejects a non-boolean value', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/notifications',
        payload: { chat_nudges_enabled: 'yes' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_BODY');
    });

    it('returns 401 when the user does not exist', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/notifications',
        payload: { chat_nudges_enabled: false },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
