import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

/**
 * Middleware-level tests: the route gate's contract (bypass, load-test key,
 * 401 shapes, uid propagation). Token *verification* itself is covered
 * cryptographically in `cognito-auth.test.ts`; here the verifier is mocked so a
 * failure is unambiguously the gate's, not the verifier's.
 */
describe('verifyCognitoJWT middleware', () => {
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
          const { verifyCognitoJWT } = await import('../middleware/auth.js');
          await verifyCognitoJWT(request as any, _reply as any);
        }],
        handler: async (request: any, reply: any) => {
          reply.send({ user: request.user });
        },
      });
    });

    it('attaches the dev bypass subject without an Authorization header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().user).toEqual({ uid: 'dev-bypass-subject-1' });
    });

    it('ignores Authorization header entirely in bypass mode', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: { authorization: 'Bearer some-invalid-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().user).toEqual({ uid: 'dev-bypass-subject-1' });
    });
  });

  describe('bypass mode disabled', () => {
    beforeEach(() => {
      delete process.env.LOCAL_DEV_BYPASS_AUTH;
      app = buildApp();
      app.get('/protected', {
        preHandler: [async (request: any, _reply: any) => {
          const { verifyCognitoJWT } = await import('../middleware/auth.js');
          await verifyCognitoJWT(request as any, _reply as any);
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

  describe('token acceptance and rejection', () => {
    let mockVerifyCognitoToken: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      delete process.env.LOCAL_DEV_BYPASS_AUTH;
      vi.resetModules();
      mockVerifyCognitoToken = vi.fn();
      vi.doMock('../lib/cognito-auth.js', () => ({
        verifyCognitoToken: mockVerifyCognitoToken,
        CognitoTokenError: class extends Error {},
      }));
      const { verifyCognitoJWT } = await import('../middleware/auth.js');
      app = buildApp();
      app.get('/test', {
        preHandler: [verifyCognitoJWT],
        handler: async (req: any, reply: any) => reply.send({ user: req.user }),
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.resetModules();
    });

    it('case 1: valid token → 200 with the Cognito sub as uid', async () => {
      mockVerifyCognitoToken.mockResolvedValue({ uid: 'test-user-123' });
      const res = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { authorization: 'Bearer valid-token-abc' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().user).toEqual({ uid: 'test-user-123' });
      expect(mockVerifyCognitoToken).toHaveBeenCalledWith('valid-token-abc');
    });

    it('case 2: expired token → 401', async () => {
      mockVerifyCognitoToken.mockRejectedValue(new Error('Token has expired'));
      const res = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { authorization: 'Bearer expired-token' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.message).toBe('Invalid or expired token');
    });

    it('case 3: malformed token → 401', async () => {
      mockVerifyCognitoToken.mockRejectedValue(new Error('Token is not a three-part JWS'));
      const res = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { authorization: 'Bearer not-even-a-token' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it('case 4: wrong signature → 401 and the reason never reaches the client', async () => {
      mockVerifyCognitoToken.mockRejectedValue(new Error('Token signature does not verify'));
      const res = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { authorization: 'Bearer wrong-sig-token' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
      expect(JSON.stringify(res.json())).not.toMatch(/signature/i);
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

    it('accepts a bare token without the Bearer prefix (load-test client shape)', async () => {
      mockVerifyCognitoToken.mockResolvedValue({ uid: 'bare-token-user' });
      const res = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { authorization: 'raw-token-no-prefix' },
      });
      expect(res.statusCode).toBe(200);
      expect(mockVerifyCognitoToken).toHaveBeenCalledWith('raw-token-no-prefix');
    });
  });

  describe('load-test mode', () => {
    beforeEach(() => {
      process.env.LOAD_TEST_MODE = 'true';
      process.env.LOAD_TEST_KEY = 'load-key-1';
      delete process.env.LOCAL_DEV_BYPASS_AUTH;
      app = buildApp();
      app.get('/lt', {
        preHandler: [async (request: any, _reply: any) => {
          const { verifyCognitoJWT } = await import('../middleware/auth.js');
          await verifyCognitoJWT(request as any, _reply as any);
        }],
        handler: async (request: any, reply: any) => reply.send({ user: request.user }),
      });
    });

    afterEach(() => {
      delete process.env.LOAD_TEST_MODE;
      delete process.env.LOAD_TEST_KEY;
    });

    it('accepts the load-test key and derives a per-VU uid', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/lt',
        headers: { 'x-load-test-key': 'load-key-1', 'x-load-test-vu-id': '7' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().user).toEqual({ uid: 'load-test-vu-7' });
    });

    it('rejects a wrong load-test key with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/lt',
        headers: { 'x-load-test-key': 'nope' },
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
