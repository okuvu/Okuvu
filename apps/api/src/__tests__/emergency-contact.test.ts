import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';
import { encrypt, decrypt, clearCachedKey } from '../crypto/emergency-contact-encryption.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    emergencyContact: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const MOCK_AUTH_SUBJECT = 'dev-bypass-subject-1';

const TEST_KEY = Buffer.alloc(32, 0x42);
const TEST_KEY_BASE64 = TEST_KEY.toString('base64');

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

describe('encryption roundtrip', () => {
  it('encrypts and decrypts successfully', () => {
    const plaintext = 'John Doe';
    const encrypted = encrypt(plaintext, TEST_KEY);
    const decrypted = decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertexts for the same plaintext (unique IV)', () => {
    const plaintext = 'Jane Doe';
    const result1 = encrypt(plaintext, TEST_KEY);
    const result2 = encrypt(plaintext, TEST_KEY);
    expect(result1).not.toBe(result2);
  });

  it('handles phone numbers with special characters', () => {
    const phone = '+1234567890';
    const encrypted = encrypt(phone, TEST_KEY);
    const decrypted = decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe(phone);
  });

  it('throws on corrupted ciphertext', () => {
    const encrypted = encrypt('test', TEST_KEY);
    const corrupted = encrypted.slice(0, -4) + 'XXXX';
    expect(() => decrypt(corrupted, TEST_KEY)).toThrow();
  });
});

describe('GET /settings/emergency-contact', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      LOCAL_DEV_BYPASS_AUTH: 'true',
      EMERGENCY_CONTACT_ENCRYPTION_KEY: TEST_KEY_BASE64,
    };
    clearCachedKey();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  describe('positive — contact exists', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: MOCK_USER_ID,
      } as any);
      vi.mocked(prisma.emergencyContact.findUnique).mockResolvedValue({
        id: 'ec-1',
        user_id: MOCK_USER_ID,
        encrypted_name: encrypt('Jane Doe', TEST_KEY),
        encrypted_phone: encrypt('+1234567890', TEST_KEY),
        created_at: new Date(),
      } as any);
      app = buildApp();
    });

    it('returns 200 with decrypted contact data', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/settings/emergency-contact',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        name: 'Jane Doe',
        phone: '+1234567890',
      });
    });
  });

  describe('positive — no contact', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: MOCK_USER_ID,
      } as any);
      vi.mocked(prisma.emergencyContact.findUnique).mockResolvedValue(null);
      app = buildApp();
    });

    it('returns 200 with null values', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/settings/emergency-contact',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ name: null, phone: null });
    });
  });

  describe('negative — user not found', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      app = buildApp();
    });

    it('returns 401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/settings/emergency-contact',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('negative — decryption failure', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: MOCK_USER_ID,
      } as any);
      vi.mocked(prisma.emergencyContact.findUnique).mockResolvedValue({
        id: 'ec-1',
        user_id: MOCK_USER_ID,
        encrypted_name: 'invalid:base64:data',
        encrypted_phone: 'also:broken:format',
        created_at: new Date(),
      } as any);
      app = buildApp();
    });

    it('returns 500 with DECRYPTION_FAILED error', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/settings/emergency-contact',
      });

      expect(response.statusCode).toBe(500);
      expect(response.json().error.code).toBe('DECRYPTION_FAILED');
    });
  });

  describe('auth — bypass disabled', () => {
    beforeEach(() => {
      delete process.env.LOCAL_DEV_BYPASS_AUTH;
      app = buildApp();
    });

    it('returns 401 when no auth header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/settings/emergency-contact',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });
  });
});

describe('PATCH /settings/emergency-contact', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      LOCAL_DEV_BYPASS_AUTH: 'true',
      EMERGENCY_CONTACT_ENCRYPTION_KEY: TEST_KEY_BASE64,
    };
    clearCachedKey();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  describe('positive — save contact', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: MOCK_USER_ID,
      } as any);
      vi.mocked(prisma.emergencyContact.upsert).mockResolvedValue({
        id: 'ec-1',
        user_id: MOCK_USER_ID,
        encrypted_name: 'encrypted',
        encrypted_phone: 'encrypted',
        created_at: new Date(),
      } as any);
      app = buildApp();
    });

    it('returns 200 with success', async () => {
      const prisma = await importMocks();

      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/emergency-contact',
        payload: { name: 'Jane Doe', phone: '+1234567890' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });

      expect(prisma.emergencyContact.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: MOCK_USER_ID },
          create: expect.objectContaining({
            user_id: MOCK_USER_ID,
            encrypted_name: expect.any(String),
            encrypted_phone: expect.any(String),
          }),
          update: expect.objectContaining({
            encrypted_name: expect.any(String),
            encrypted_phone: expect.any(String),
          }),
        }),
      );

      const callArgs = vi.mocked(prisma.emergencyContact.upsert).mock
        .calls[0][0] as any;
      expect(callArgs.create.encrypted_name).not.toBe('Jane Doe');
      expect(callArgs.create.encrypted_phone).not.toBe('+1234567890');
    });
  });

  describe('positive — clear contact', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: MOCK_USER_ID,
      } as any);
      vi.mocked(prisma.emergencyContact.deleteMany).mockResolvedValue({
        count: 1,
      } as any);
      app = buildApp();
    });

    it('returns 200 and deletes the record', async () => {
      const prisma = await importMocks();

      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/emergency-contact',
        payload: { clear: true },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });

      expect(prisma.emergencyContact.deleteMany).toHaveBeenCalledWith({
        where: { user_id: MOCK_USER_ID },
      });
    });
  });

  describe('negative — invalid phone format', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: MOCK_USER_ID,
      } as any);
      app = buildApp();
    });

    it('returns 400 for non-E.164 phone', async () => {
      const prisma = await importMocks();

      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/emergency-contact',
        payload: { name: 'Jane', phone: '12345' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_PHONE_FORMAT');
      expect(prisma.emergencyContact.upsert).not.toHaveBeenCalled();
    });
  });

  describe('negative — name too long', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: MOCK_USER_ID,
      } as any);
      app = buildApp();
    });

    it('returns 400 for a name exceeding the max length', async () => {
      const prisma = await importMocks();

      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/emergency-contact',
        payload: { name: 'x'.repeat(201), phone: '+1234567890' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('NAME_TOO_LONG');
      expect(prisma.emergencyContact.upsert).not.toHaveBeenCalled();
    });
  });

  describe('negative — user not found', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      app = buildApp();
    });

    it('returns 401', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/emergency-contact',
        payload: { name: 'Jane', phone: '+1234567890' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('negative — invalid body', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: MOCK_USER_ID,
      } as any);
      app = buildApp();
    });

    it('returns 400 for empty body', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/emergency-contact',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_BODY');
    });

    it('returns 400 when clear is false', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/emergency-contact',
        payload: { clear: false },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_BODY');
    });
  });

  describe('negative — empty name and phone', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: MOCK_USER_ID,
      } as any);
      app = buildApp();
    });

    it('returns 400 when both name and phone are empty', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/emergency-contact',
        payload: { name: '', phone: '' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('EMPTY_CONTACT');
    });
  });

  describe('auth — bypass disabled', () => {
    beforeEach(() => {
      delete process.env.LOCAL_DEV_BYPASS_AUTH;
      app = buildApp();
    });

    it('returns 401 when no auth header', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/settings/emergency-contact',
        payload: { name: 'Jane', phone: '+1234567890' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });
  });
});
