import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
});
