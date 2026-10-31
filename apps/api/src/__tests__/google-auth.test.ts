import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPairSync, sign as cryptoSign, type KeyObject } from 'node:crypto';
import {
  GoogleTokenError,
  isGoogleSignInConfigured,
  verifyGoogleIdToken,
} from '../lib/google-auth.js';
import { __resetRs256JwksCacheForTests } from '../lib/rs256-jwks.js';

/**
 * Cryptographic tests for Google ID-token verification.
 *
 * Real RS256 tokens signed with a throwaway keypair, JWKS served through a
 * stubbed `fetch` — the verifier runs exactly as in production, with no mock of
 * the code under test. Anything that would let a forged, foreign or
 * unverified-email token mint a session has to fail here.
 */

const CLIENT_ID = 'okuvu-web-client-id.apps.googleusercontent.com';
const KID = 'google-test-key-1';
const ORIGINAL_ENV = { ...process.env };

let privateKey: KeyObject;
let publicJwk: Record<string, unknown>;
let fetchMock: ReturnType<typeof vi.fn>;

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

interface TokenOverrides {
  header?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  signingKey?: KeyObject;
  omitKid?: boolean;
}

function makeToken(overrides: TokenOverrides = {}): string {
  const now = Math.floor(Date.now() / 1000);

  const header: Record<string, unknown> = { alg: 'RS256', kid: KID, ...overrides.header };
  if (overrides.omitKid) delete header.kid;

  const payload = {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: 'google-sub-abc',
    email: 'client@example.com',
    email_verified: true,
    iat: now,
    exp: now + 3600,
    ...overrides.payload,
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = cryptoSign('RSA-SHA256', Buffer.from(signingInput), overrides.signingKey ?? privateKey);
  return `${signingInput}.${base64url(signature)}`;
}

describe('verifyGoogleIdToken', () => {
  beforeEach(() => {
    process.env.GOOGLE_MOBILE_CLIENT_ID = CLIENT_ID;
    __resetRs256JwksCacheForTests();

    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKey = pair.privateKey;
    publicJwk = {
      ...(pair.publicKey.export({ format: 'jwk' }) as Record<string, unknown>),
      kid: KID,
      alg: 'RS256',
      use: 'sig',
    };

    // Google's v3 certs endpoint is a bare `{kid: jwk}` map, not `{keys: []}`.
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ [KID]: publicJwk }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
    __resetRs256JwksCacheForTests();
  });

  it('accepts a valid Google ID token and returns the identity', async () => {
    const identity = await verifyGoogleIdToken(makeToken());

    expect(identity).toEqual({
      sub: 'google-sub-abc',
      email: 'client@example.com',
      name: undefined,
    });
  });

  it('accepts the bare "accounts.google.com" issuer spelling', async () => {
    const identity = await verifyGoogleIdToken(
      makeToken({ payload: { iss: 'accounts.google.com' } }),
    );

    expect(identity.sub).toBe('google-sub-abc');
  });

  it('normalises the email to lower case', async () => {
    const identity = await verifyGoogleIdToken(
      makeToken({ payload: { email: 'Client@Example.COM' } }),
    );

    expect(identity.email).toBe('client@example.com');
  });

  it('rejects a token minted for a different OAuth client', async () => {
    await expect(
      verifyGoogleIdToken(makeToken({ payload: { aud: 'someone-elses-client-id' } })),
    ).rejects.toMatchObject({ reason: 'bad_audience' });
  });

  it('rejects a token from an untrusted issuer', async () => {
    await expect(
      verifyGoogleIdToken(makeToken({ payload: { iss: 'https://evil.example.com' } })),
    ).rejects.toMatchObject({ reason: 'bad_issuer' });
  });

  it('rejects an expired token', async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(
      verifyGoogleIdToken(makeToken({ payload: { iat: now - 7200, exp: now - 3600 } })),
    ).rejects.toMatchObject({ reason: 'expired' });
  });

  it('rejects a token signed by a key Google does not publish', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });

    await expect(
      verifyGoogleIdToken(makeToken({ signingKey: other.privateKey })),
    ).rejects.toMatchObject({ reason: 'bad_signature' });
  });

  it('rejects an unsigned token', async () => {
    await expect(
      verifyGoogleIdToken(makeToken({ header: { alg: 'none' } })),
    ).rejects.toMatchObject({ reason: 'bad_alg' });
  });

  it('rejects a token with no kid', async () => {
    await expect(
      verifyGoogleIdToken(makeToken({ omitKid: true })),
    ).rejects.toMatchObject({ reason: 'malformed' });
  });

  it('rejects an account whose email Google has not verified', async () => {
    await expect(
      verifyGoogleIdToken(makeToken({ payload: { email_verified: false } })),
    ).rejects.toMatchObject({ reason: 'email_unverified' });
  });

  it('rejects a token with no email claim', async () => {
    await expect(
      verifyGoogleIdToken(makeToken({ payload: { email: undefined } })),
    ).rejects.toMatchObject({ reason: 'no_email' });
  });

  it('fails closed when the client id is not configured', async () => {
    delete process.env.GOOGLE_MOBILE_CLIENT_ID;

    expect(isGoogleSignInConfigured()).toBe(false);
    await expect(verifyGoogleIdToken(makeToken())).rejects.toMatchObject({
      reason: 'config_missing',
    });
  });

  it('propagates a JWKS fetch failure as an error, not an accept', async () => {
    fetchMock.mockImplementationOnce(async () => new Response('nope', { status: 503 }));

    await expect(verifyGoogleIdToken(makeToken())).rejects.toBeInstanceOf(GoogleTokenError);
  });
});
