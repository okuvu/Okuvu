import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    clinicalConfig: {
      findUnique: vi.fn(),
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

function validPayload(overrides?: Partial<Record<string, unknown>>) {
  return {
    care_plan_id: 'CP1',
    assignment_state: 'provisional',
    confidence_at_last_eval: 0.85,
    turns_evaluated: 1,
    ...overrides,
  };
}

describe('PATCH /users/:id/care-plan', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  describe('positive — valid values', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      vi.mocked(prisma.clinicalConfig.findUnique).mockResolvedValue(null);
      app = buildApp();
    });

    it('persists all 4 fields on first call', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.clinicalConfig.upsert).mockResolvedValue({
        care_plan_id: 'CP1',
        assignment_state: 'provisional',
      } as any);

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${MOCK_USER_ID}/care-plan`,
        payload: validPayload(),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        success: true,
        care_plan_id: 'CP1',
        assignment_state: 'provisional',
      });

      expect(prisma.clinicalConfig.upsert).toHaveBeenCalledWith({
        where: { user_id: MOCK_USER_ID },
        create: {
          user_id: MOCK_USER_ID,
          care_plan_id: 'CP1',
          assignment_state: 'provisional',
          confidence_at_last_eval: 0.85,
          turns_evaluated: 1,
        },
        update: {
          care_plan_id: 'CP1',
          assignment_state: 'provisional',
          confidence_at_last_eval: 0.85,
          turns_evaluated: 1,
        },
      });
    });

    it('returns updated values on subsequent call with different data', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.clinicalConfig.findUnique).mockResolvedValue({
        turns_evaluated: 1,
        assignment_state: 'provisional',
      } as any);
      vi.mocked(prisma.clinicalConfig.upsert).mockResolvedValue({
        care_plan_id: 'CP2',
        assignment_state: 'confirmed',
      } as any);

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${MOCK_USER_ID}/care-plan`,
        payload: {
          care_plan_id: 'CP2',
          assignment_state: 'confirmed',
          confidence_at_last_eval: 0.92,
          turns_evaluated: 3,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        success: true,
        care_plan_id: 'CP2',
        assignment_state: 'confirmed',
      });
    });

    it('accepts CP2 and CP3 care_plan_id values', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.clinicalConfig.upsert).mockResolvedValue({
        care_plan_id: 'CP3',
        assignment_state: 'confirmed',
      } as any);

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${MOCK_USER_ID}/care-plan`,
        payload: validPayload({ care_plan_id: 'CP3', assignment_state: 'confirmed' }),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().care_plan_id).toBe('CP3');
      expect(response.json().assignment_state).toBe('confirmed');
    });
  });

  describe('negative — invalid values', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      app = buildApp();
    });

    it('returns 400 for invalid care_plan_id', async () => {
      const prisma = await importMocks();

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${MOCK_USER_ID}/care-plan`,
        payload: validPayload({ care_plan_id: 'CP4' }),
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('INVALID_CARE_PLAN_ID');

      expect(prisma.clinicalConfig.upsert).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid assignment_state', async () => {
      const prisma = await importMocks();

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${MOCK_USER_ID}/care-plan`,
        payload: validPayload({ assignment_state: 'invalid' }),
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('INVALID_ASSIGNMENT_STATE');

      expect(prisma.clinicalConfig.upsert).not.toHaveBeenCalled();
    });
  });

  describe('edge — out-of-order turns_evaluated', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      vi.mocked(prisma.clinicalConfig.findUnique).mockResolvedValue({
        turns_evaluated: 3,
        assignment_state: 'confirmed',
      } as any);
      app = buildApp();
    });

    it('returns 400 when turns_evaluated moves backward', async () => {
      const prisma = await importMocks();

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${MOCK_USER_ID}/care-plan`,
        payload: validPayload({ turns_evaluated: 1 }),
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('STALE_TURNS_EVALUATED');
      expect(body.error.message).toContain('1');
      expect(body.error.message).toContain('3');

      expect(prisma.clinicalConfig.upsert).not.toHaveBeenCalled();
    });
  });

  describe('security — self-only authorization', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      app = buildApp();
    });

    it('returns 403 when :id does not match authenticated user', async () => {
      const prisma = await importMocks();

      const response = await app.inject({
        method: 'PATCH',
        url: '/users/different-user-id/care-plan',
        payload: validPayload(),
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.error.code).toBe('FORBIDDEN');

      expect(prisma.clinicalConfig.upsert).not.toHaveBeenCalled();
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
        method: 'PATCH',
        url: `/users/${MOCK_USER_ID}/care-plan`,
        payload: validPayload(),
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');

      expect(prisma.clinicalConfig.upsert).not.toHaveBeenCalled();
    });
  });

  describe('bypass disabled — 401 without auth', () => {
    beforeEach(() => {
      delete process.env.LOCAL_DEV_BYPASS_AUTH;
      app = buildApp();
    });

    it('returns 401 when no Authorization header', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${MOCK_USER_ID}/care-plan`,
        payload: validPayload(),
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('idempotency — duplicate calls', () => {
    beforeEach(async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
      vi.mocked(prisma.clinicalConfig.findUnique).mockResolvedValue({
        turns_evaluated: 1,
        assignment_state: 'provisional',
      } as any);
      vi.mocked(prisma.clinicalConfig.upsert).mockResolvedValue({
        id: 'mock-id',
        user_id: MOCK_USER_ID,
        care_plan_id: 'CP1',
        assignment_state: 'provisional',
        confidence_at_last_eval: null,
        turns_evaluated: 1,
        user: null,
      } as any);
      app = buildApp();
    });

    it('succeeds on both calls with same values', async () => {
      const payload = validPayload();

      const [res1, res2] = await Promise.all([
        app.inject({ method: 'PATCH', url: `/users/${MOCK_USER_ID}/care-plan`, payload }),
        app.inject({ method: 'PATCH', url: `/users/${MOCK_USER_ID}/care-plan`, payload }),
      ]);

      expect(res1.statusCode).toBe(200);
      expect(res2.statusCode).toBe(200);
    });

    it('overwrites prior values with updated data on second call', async () => {
      const prisma = await importMocks();

      const payload1 = validPayload({ turns_evaluated: 1, assignment_state: 'provisional' });
      const payload2 = validPayload({ turns_evaluated: 2, assignment_state: 'confirmed' });

      const res1 = await app.inject({
        method: 'PATCH',
        url: `/users/${MOCK_USER_ID}/care-plan`,
        payload: payload1,
      });
      expect(res1.statusCode).toBe(200);

      vi.mocked(prisma.clinicalConfig.findUnique).mockResolvedValueOnce({
        turns_evaluated: 1,
        assignment_state: 'provisional',
      } as any);
      vi.mocked(prisma.clinicalConfig.upsert).mockResolvedValueOnce({
        id: 'mock-id',
        user_id: MOCK_USER_ID,
        care_plan_id: 'CP1',
        assignment_state: 'confirmed',
        confidence_at_last_eval: null,
        turns_evaluated: 2,
        user: null,
      } as any);

      const res2 = await app.inject({
        method: 'PATCH',
        url: `/users/${MOCK_USER_ID}/care-plan`,
        payload: payload2,
      });
      expect(res2.statusCode).toBe(200);
      expect(res2.json().assignment_state).toBe('confirmed');
    });
  });
});
