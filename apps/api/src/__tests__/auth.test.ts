import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

describe('verifyFirebaseJWT middleware', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
  });

  describe('bypass mode enabled', () => {
    beforeEach(() => {
      process.env.LOCAL_DEV_BYPASS_AUTH = 'true';
      app = buildApp();
      app.get('/protected', {
        preHandler: [async (request: any, _reply: any) => {
          const { verifyFirebaseJWT } = await import('../middleware/auth.js');
          await verifyFirebaseJWT(request as any, _reply as any);
        }],
        handler: async (request: any, reply: any) => {
          reply.send({ user: request.user });
        },
      });
    });

    it('attaches fake user id without Authorization header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.user).toEqual({ uid: 'mock-firebase-uid-1' });
    });

    it('ignores Authorization header entirely in bypass mode', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: { authorization: 'Bearer some-invalid-token' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.user).toEqual({ uid: 'mock-firebase-uid-1' });
    });
  });

  describe('bypass mode disabled', () => {
    beforeEach(() => {
      delete process.env.LOCAL_DEV_BYPASS_AUTH;
      app = buildApp();
      app.get('/protected', {
        preHandler: [async (request: any, _reply: any) => {
          const { verifyFirebaseJWT } = await import('../middleware/auth.js');
          await verifyFirebaseJWT(request as any, _reply as any);
        }],
        handler: async (request: any, reply: any) => {
          reply.send({ ok: true });
        },
      });
    });

    it('returns 401 when no Authorization header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toBe('Missing Authorization header');
    });
  });

  describe('production mode - all 5 token cases', () => {
    let mockVerifyFirebaseToken: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      delete process.env.LOCAL_DEV_BYPASS_AUTH;
      vi.resetModules();
      mockVerifyFirebaseToken = vi.fn();
      vi.doMock('../lib/firebase-admin.js', () => ({
        verifyFirebaseToken: mockVerifyFirebaseToken,
      }));
      const { verifyFirebaseJWT } = await import('../middleware/auth.js');
      app = buildApp();
      app.get('/test', {
        preHandler: [verifyFirebaseJWT],
        handler: async (req: any, reply: any) => reply.send({ user: req.user }),
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.resetModules();
    });

    it('case 1: valid token → 200 with user uid', async () => {
      mockVerifyFirebaseToken.mockResolvedValue({ uid: 'test-user-123' });
      const res = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { authorization: 'Bearer valid-token-abc' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().user).toEqual({ uid: 'test-user-123' });
    });

    it('case 2: expired token → 401', async () => {
      mockVerifyFirebaseToken.mockRejectedValue(new Error('Firebase token expired'));
      const res = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { authorization: 'Bearer expired-token' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.message).toBe('Invalid or expired token');
    });

    it('case 3: malformed token → 401', async () => {
      mockVerifyFirebaseToken.mockRejectedValue(new Error('invalid token format'));
      const res = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { authorization: 'Bearer not-even-a-token' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it('case 4: wrong signature token → 401', async () => {
      mockVerifyFirebaseToken.mockRejectedValue(new Error('token signature mismatch'));
      const res = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { authorization: 'Bearer wrong-sig-token' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it('case 5: missing token → 401 with UNAUTHORIZED', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/test',
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
      expect(res.json().error.message).toBe('Missing Authorization header');
    });
  });
});
