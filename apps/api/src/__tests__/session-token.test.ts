import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import Fastify, { type FastifyRequest } from 'fastify';
import {
  SESSION_AUDIENCE,
  SESSION_ISSUER,
  SessionTokenError,
  looksLikeSessionToken,
  mintSessionToken,
  verifySessionToken,
} from '../lib/session-token.js';
import { verifyCognitoJWT } from '../middleware/auth.js';

/**
 * Session tokens are the mobile app's bearer after Google sign-in. Every
 * authenticated route in the API trusts `request.user.uid`, which this token
 * supplies — so a token that verifies when it should not is a total
 * authentication bypass, and a token that fails when it should not is a total
 * outage. Both directions are tested here.
 */

const SECRET = 'test-session-secret-0123456789abcdef';
const ORIGINAL_ENV = { ...process.env };

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Hand-mint a token so expiry/signature edge cases can be constructed exactly. */
function forgeToken(
  payload: Record<string, unknown>,
  options: { secret?: string; alg?: string } = {},
): string {
  const header = base64Url(JSON.stringify({ alg: options.alg ?? 'HS256', typ: 'JWT' }));
  const body = base64Url(JSON.stringify(payload));
  const input = `${header}.${body}`;
  const signature = base64Url(
    createHmac('sha256', options.secret ?? SECRET).update(input).digest(),
  );
  return `${input}.${signature}`;
}

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: 'google-sub-123',
    iss: SESSION_ISSUER,
    aud: SESSION_AUDIENCE,
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
}

describe('session-token', () => {
  beforeEach(() => {
    process.env.OKUVU_SESSION_SECRET = SECRET;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('mints a token that verifies and yields the subject as uid', async () => {
    const { token, expiresAt } = mintSessionToken('google-sub-123');

    const verified = await verifySessionToken(token);

    expect(verified.uid).toBe('google-sub-123');
    // 30-day TTL with a minute of slack for the second boundary.
    const ttl = expiresAt - Math.floor(Date.now() / 1000);
    expect(ttl).toBeGreaterThan(30 * 24 * 3600 - 60);
    expect(ttl).toBeLessThanOrEqual(30 * 24 * 3600);
  });

  it('refuses to mint without a subject', () => {
    expect(() => mintSessionToken('')).toThrow(SessionTokenError);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = forgeToken(validPayload(), { secret: 'a-different-secret-0123456789abcdef' });

    await expect(verifySessionToken(token)).rejects.toMatchObject({ reason: 'bad_signature' });
  });

  it('rejects a tampered payload even though the header is unchanged', async () => {
    const [header, , signature] = mintSessionToken('google-sub-123').token.split('.');
    const forgedPayload = base64Url(JSON.stringify(validPayload({ sub: 'someone-else' })));

    await expect(
      verifySessionToken(`${header}.${forgedPayload}.${signature}`),
    ).rejects.toMatchObject({ reason: 'bad_signature' });
  });

  it('rejects an expired token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = forgeToken(validPayload({ iat: now - 7200, exp: now - 3600 }));

    await expect(verifySessionToken(token)).rejects.toMatchObject({ reason: 'expired' });
  });

  it('rejects a token for another audience', async () => {
    const token = forgeToken(validPayload({ aud: 'some-other-app' }));

    await expect(verifySessionToken(token)).rejects.toMatchObject({ reason: 'bad_audience' });
  });

  it('rejects a token from another issuer', async () => {
    const token = forgeToken(validPayload({ iss: 'someone-else' }));

    await expect(verifySessionToken(token)).rejects.toMatchObject({ reason: 'bad_issuer' });
  });

  it('rejects an unsigned (alg: none) token', async () => {
    const token = forgeToken(validPayload(), { alg: 'none' });

    await expect(verifySessionToken(token)).rejects.toMatchObject({ reason: 'bad_alg' });
  });

  it('rejects a non-JWS string', async () => {
    await expect(verifySessionToken('not-a-token')).rejects.toMatchObject({
      reason: 'malformed',
    });
  });

  it('fails closed when the secret is missing or too short', async () => {
    process.env.OKUVU_SESSION_SECRET = 'too-short';

    expect(() => mintSessionToken('google-sub-123')).toThrow(SessionTokenError);
    await expect(verifySessionToken(forgeToken(validPayload()))).rejects.toMatchObject({
      reason: 'config_missing',
    });
  });

  it('identifies its own tokens by issuer without verifying them', () => {
    expect(looksLikeSessionToken(mintSessionToken('google-sub-123').token)).toBe(true);
    expect(looksLikeSessionToken(forgeToken(validPayload({ iss: 'https://accounts.google.com' })))).toBe(false);
    expect(looksLikeSessionToken('garbage')).toBe(false);
  });
});

describe('auth middleware with a session token', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(() => {
    process.env.OKUVU_SESSION_SECRET = SECRET;
    delete process.env.LOCAL_DEV_BYPASS_AUTH;
    app = Fastify();
    app.get('/protected', { preHandler: [verifyCognitoJWT] }, async (request: FastifyRequest) => ({
      uid: request.user.uid,
    }));
  });

  afterEach(async () => {
    await app.close();
    process.env = { ...ORIGINAL_ENV };
  });

  it('accepts a minted session token and exposes the subject as uid', async () => {
    const { token } = mintSessionToken('google-sub-route');

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ uid: 'google-sub-route' });
  });

  it('rejects a session token signed with the wrong secret', async () => {
    const token = forgeToken(validPayload(), { secret: 'a-different-secret-0123456789abcdef' });

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(401);
  });

  it('rejects a request with no Authorization header', async () => {
    const response = await app.inject({ method: 'GET', url: '/protected' });

    expect(response.statusCode).toBe(401);
  });
});
