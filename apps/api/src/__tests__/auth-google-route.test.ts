import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { buildApp } from '../app.js';
import { __resetRs256JwksCacheForTests } from '../lib/rs256-jwks.js';
import { verifySessionToken } from '../lib/session-token.js';

/**
 * `POST /auth/google` — the endpoint every mobile sign-in goes through.
 *
 * The Google ID token is real (signed here, JWKS stubbed) and the session token
 * it returns is really verified, so this covers the whole path a client takes:
 * Google token in, Okuvu bearer out, account linked or waitlisted. Prisma is the
 * only mock.
 */

const CLIENT_ID = 'okuvu-web-client-id.apps.googleusercontent.com';
const KID = 'google-route-test-key';
const SESSION_SECRET = 'route-test-session-secret-0123456789';
const GOOGLE_SUB = 'google-sub-route-1';
const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

let privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
let publicJwk: Record<string, unknown>;

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function makeGoogleToken(overrides: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', kid: KID };
  const payload = {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: GOOGLE_SUB,
    email: 'client@example.com',
    email_verified: true,
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  return `${signingInput}.${base64url(cryptoSign('RSA-SHA256', Buffer.from(signingInput), privateKey))}`;
}

async function prismaMock() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma.user as unknown as {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
}

describe('POST /auth/google', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    process.env.GOOGLE_MOBILE_CLIENT_ID = CLIENT_ID;
    process.env.OKUVU_SESSION_SECRET = SESSION_SECRET;
    delete process.env.LOCAL_DEV_BYPASS_AUTH;
    __resetRs256JwksCacheForTests();

    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKey = pair.privateKey;
    publicJwk = {
      ...(pair.publicKey.export({ format: 'jwk' }) as Record<string, unknown>),
      kid: KID,
      alg: 'RS256',
      use: 'sig',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ [KID]: publicJwk }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const user = await prismaMock();
    user.findUnique.mockReset();
    user.findFirst.mockReset();
    user.update.mockReset();
    user.update.mockResolvedValue({});

    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
    __resetRs256JwksCacheForTests();
  });

  it('signs in an already-linked client and returns a verifiable session token', async () => {
    const user = await prismaMock();
    user.findUnique.mockResolvedValue({
      id: 'user-1',
      phone_number: '+919****3210',
      email: 'client@example.com',
      deleted_at: null,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { id_token: makeGoogleToken() },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.has_account).toBe(true);
    expect(body.user_id).toBe('user-1');
    expect(body.linked).toBe(false);
    expect(body.email).toBe('client@example.com');

    const session = await verifySessionToken(body.token as string);
    expect(session.uid).toBe(GOOGLE_SUB);
  });

  it('binds the Google subject to an invited placeholder matched by email', async () => {
    const user = await prismaMock();
    user.findUnique.mockResolvedValue(null);
    user.findFirst.mockResolvedValue({
      id: 'user-invited',
      auth_subject: null,
      phone_number: '+919****3210',
      email: 'client@example.com',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { id_token: makeGoogleToken() },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      has_account: true,
      linked: true,
      user_id: 'user-invited',
    });
    expect(user.update).toHaveBeenCalledWith({
      where: { id: 'user-invited' },
      data: { auth_subject: GOOGLE_SUB },
    });
  });

  it('matches the placeholder address case-insensitively', async () => {
    const user = await prismaMock();
    user.findUnique.mockResolvedValue(null);
    user.findFirst.mockResolvedValue({
      id: 'user-invited',
      auth_subject: null,
      phone_number: '+919****3210',
      email: 'Client@Example.com',
    });

    await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { id_token: makeGoogleToken({ email: 'CLIENT@example.com' }) },
    });

    expect(user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          email: { equals: 'client@example.com', mode: 'insensitive' },
        }),
      }),
    );
  });

  it('returns a token with has_account:false for someone with no invite', async () => {
    const user = await prismaMock();
    user.findUnique.mockResolvedValue(null);
    user.findFirst.mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { id_token: makeGoogleToken({ email: 'stranger@example.com' }) },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.has_account).toBe(false);
    expect(body.user_id).toBeNull();
    // The token still exists — the app needs it to redeem an invite.
    await expect(verifySessionToken(body.token as string)).resolves.toEqual({ uid: GOOGLE_SUB });
  });

  it('refuses an email already bound to a different subject', async () => {
    const user = await prismaMock();
    user.findUnique.mockResolvedValue(null);
    user.findFirst.mockResolvedValue({
      id: 'user-other',
      auth_subject: 'cognito-sub-someone-else',
      phone_number: '+919****3210',
      email: 'client@example.com',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { id_token: makeGoogleToken() },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('EMAIL_IN_USE');
    expect(user.update).not.toHaveBeenCalled();
  });

  it('refuses a closed account', async () => {
    const user = await prismaMock();
    user.findUnique.mockResolvedValue({
      id: 'user-gone',
      phone_number: '+919****3210',
      email: 'client@example.com',
      deleted_at: new Date(),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { id_token: makeGoogleToken() },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('ACCOUNT_DELETED');
  });

  it('rejects a token minted for another OAuth client', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { id_token: makeGoogleToken({ aud: 'another-client-id' }) },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('INVALID_GOOGLE_TOKEN');
  });

  it('rejects an unverified-email Google account', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { id_token: makeGoogleToken({ email_verified: false }) },
    });

    expect(response.statusCode).toBe(401);
  });

  it('rejects a missing id_token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_BODY');
  });
});
