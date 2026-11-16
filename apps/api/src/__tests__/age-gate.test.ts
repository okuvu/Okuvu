import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

/**
 * The API half of the client's 18+ gate (`middleware/age-gate.ts`).
 *
 * The app shows the blocking screen; this proves the server refuses too, so a
 * reinstall — or a build with the screen removed — cannot walk back in. The
 * auth verifier is bypassed (dev bypass) so a failure here is unambiguously the
 * gate's, not the token's.
 */

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));

async function prismaMock() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma.user as unknown as { findUnique: ReturnType<typeof vi.fn> };
}

describe('requireAdultAccount middleware', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV };
    process.env.LOCAL_DEV_BYPASS_AUTH = 'true';

    const user = await prismaMock();
    user.findUnique.mockReset();

    app = buildApp();
    const { verifyCognitoJWT } = await import('../middleware/auth.js');
    const { requireAdultAccount } = await import('../middleware/age-gate.js');
    app.get('/gated', {
      preHandler: [verifyCognitoJWT, requireAdultAccount],
      handler: async (_request, reply) => reply.send({ ok: true }),
    });
    await app.ready();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
  });

  it('passes a client who confirmed they are an adult', async () => {
    const user = await prismaMock();
    user.findUnique.mockResolvedValue({
      age_confirmed_at: new Date(),
      age_declined_at: null,
    });

    const response = await app.inject({ method: 'GET', url: '/gated' });
    expect(response.statusCode).toBe(200);
  });

  it('passes a client who has never been asked', async () => {
    // Every invited row created before this feature, and every build already in
    // the field: refusing here would lock existing users out on deploy.
    const user = await prismaMock();
    user.findUnique.mockResolvedValue({
      age_confirmed_at: null,
      age_declined_at: null,
    });

    const response = await app.inject({ method: 'GET', url: '/gated' });
    expect(response.statusCode).toBe(200);
  });

  it('refuses a recorded refusal', async () => {
    const user = await prismaMock();
    user.findUnique.mockResolvedValue({
      age_confirmed_at: null,
      age_declined_at: new Date(),
    });

    const response = await app.inject({ method: 'GET', url: '/gated' });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('UNDER_18');
  });

  it('lets a later confirmation clear an earlier refusal', async () => {
    // `recordAgeAttestation` clears the refusal; the gate must follow the same
    // rule rather than keeping its own copy of "declined".
    const user = await prismaMock();
    user.findUnique.mockResolvedValue({
      age_confirmed_at: new Date(),
      age_declined_at: new Date(),
    });

    const response = await app.inject({ method: 'GET', url: '/gated' });
    expect(response.statusCode).toBe(200);
  });

  it('answers 401 when the subject has no row', async () => {
    const user = await prismaMock();
    user.findUnique.mockResolvedValue(null);

    const response = await app.inject({ method: 'GET', url: '/gated' });
    expect(response.statusCode).toBe(401);
  });
});
