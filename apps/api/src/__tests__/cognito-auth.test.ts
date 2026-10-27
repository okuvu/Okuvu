import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPairSync, sign as cryptoSign, type KeyObject } from 'node:crypto';
import {
  verifyCognitoToken,
  resolveCognitoConfig,
  CognitoTokenError,
  __resetJwksCacheForTests,
} from '../lib/cognito-auth.js';

/**
 * Cryptographic tests for Cognito token verification.
 *
 * These sign real RS256 tokens with a throwaway keypair and serve the matching
 * JWKS through a stubbed `fetch`, so the verifier is exercised exactly as it
 * runs in production — no mock of the code under test. Anything that would let
 * a forged or foreign token through has to fail here.
 */

const REGION = 'ap-south-1';
const POOL_ID = 'ap-south-1_TestPool1';
const CLIENT_ID = 'test-app-client-id';
const KID = 'test-signing-key-1';

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

  const header = {
    alg: 'RS256',
    kid: KID,
    ...overrides.header,
  };
  if (overrides.omitKid) delete (header as Record<string, unknown>).kid;

  const payload = {
    sub: 'cognito-sub-abc',
    iss: `https://cognito-idp.${REGION}.amazonaws.com/${POOL_ID}`,
    aud: CLIENT_ID,
    client_id: CLIENT_ID,
    token_use: 'id',
    iat: now - 30,
    exp: now + 3600,
    ...overrides.payload,
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = cryptoSign('RSA-SHA256', Buffer.from(signingInput), overrides.signingKey ?? privateKey);
  return `${signingInput}.${base64url(signature)}`;
}

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    COGNITO_REGION: REGION,
    COGNITO_USER_POOL_ID: POOL_ID,
    COGNITO_CLIENT_ID: CLIENT_ID,
  };
  delete process.env.AWS_REGION;

  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  privateKey = pair.privateKey;
  publicJwk = {
    ...(pair.publicKey.export({ format: 'jwk' }) as Record<string, unknown>),
    kid: KID,
    alg: 'RS256',
    use: 'sig',
  };

  fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ keys: [publicJwk] }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  __resetJwksCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  __resetJwksCacheForTests();
  process.env = { ...ORIGINAL_ENV };
});

describe('resolveCognitoConfig', () => {
  it('derives the issuer from region and pool id', () => {
    const config = resolveCognitoConfig();
    expect(config.issuer).toBe(`https://cognito-idp.${REGION}.amazonaws.com/${POOL_ID}`);
    expect(config.clientId).toBe(CLIENT_ID);
  });

  it('falls back to AWS_REGION when COGNITO_REGION is unset', () => {
    delete process.env.COGNITO_REGION;
    process.env.AWS_REGION = 'eu-west-1';
    expect(resolveCognitoConfig().issuer).toContain('eu-west-1');
  });

  it('throws config_missing when the pool or client is unset', () => {
    delete process.env.COGNITO_USER_POOL_ID;
    expect(() => resolveCognitoConfig()).toThrow(CognitoTokenError);
    expect(() => resolveCognitoConfig()).toThrow(/COGNITO_USER_POOL_ID/);
  });
});

describe('verifyCognitoToken — accepted tokens', () => {
  it('returns the sub claim of a valid ID token', async () => {
    const result = await verifyCognitoToken(makeToken());
    expect(result).toEqual({ uid: 'cognito-sub-abc' });
  });

  it('accepts an access token, which carries client_id instead of aud', async () => {
    const token = makeToken({
      payload: { token_use: 'access', aud: undefined, client_id: CLIENT_ID },
    });
    await expect(verifyCognitoToken(token)).resolves.toEqual({ uid: 'cognito-sub-abc' });
  });

  it('fetches the JWKS from the pool-scoped well-known URL', async () => {
    await verifyCognitoToken(makeToken());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `https://cognito-idp.${REGION}.amazonaws.com/${POOL_ID}/.well-known/jwks.json`,
    );
  });

  it('caches keys: a second verification does not refetch', async () => {
    await verifyCognitoToken(makeToken());
    await verifyCognitoToken(makeToken());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('verifyCognitoToken — rejected tokens', () => {
  it('rejects a token signed by a different key', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    const token = makeToken({ signingKey: other });
    await expect(verifyCognitoToken(token)).rejects.toThrow(/signature/i);
  });

  it('rejects an expired token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = makeToken({ payload: { exp: now - 3600 } });
    await expect(verifyCognitoToken(token)).rejects.toThrow(/expired/i);
  });

  it('tolerates 60s of clock skew but not more', async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(verifyCognitoToken(makeToken({ payload: { exp: now - 30 } }))).resolves.toBeTruthy();
    await expect(
      verifyCognitoToken(makeToken({ payload: { exp: now - 300 } })),
    ).rejects.toThrow(/expired/i);
  });

  it('rejects a token that is not valid yet', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = makeToken({ payload: { nbf: now + 600 } });
    await expect(verifyCognitoToken(token)).rejects.toThrow(/not valid yet/i);
  });

  it('rejects a token from another user pool', async () => {
    const token = makeToken({
      payload: { iss: `https://cognito-idp.${REGION}.amazonaws.com/ap-south-1_OtherPool` },
    });
    await expect(verifyCognitoToken(token)).rejects.toThrow(/different user pool/i);
  });

  it('rejects a token minted for another app client', async () => {
    const token = makeToken({ payload: { aud: 'someone-elses-client' } });
    await expect(verifyCognitoToken(token)).rejects.toThrow(/different app client/i);
  });

  it('rejects an access token minted for another app client', async () => {
    const token = makeToken({
      payload: { token_use: 'access', aud: undefined, client_id: 'other-client' },
    });
    await expect(verifyCognitoToken(token)).rejects.toThrow(/different app client/i);
  });

  it('rejects alg=none outright', async () => {
    const token = makeToken({ header: { alg: 'none' } });
    await expect(verifyCognitoToken(token)).rejects.toThrow(/algorithm/i);
  });

  it('rejects a token with no kid', async () => {
    const token = makeToken({ omitKid: true });
    await expect(verifyCognitoToken(token)).rejects.toThrow(/kid/i);
  });

  it('rejects a structural non-JWS', async () => {
    await expect(verifyCognitoToken('not-a-token')).rejects.toThrow(/three-part/i);
  });

  it('rejects a token whose header is not JSON', async () => {
    await expect(verifyCognitoToken('%%%.%%%.%%%')).rejects.toThrow(CognitoTokenError);
  });

  it('rejects a token with no sub claim', async () => {
    const token = makeToken({ payload: { sub: undefined } });
    await expect(verifyCognitoToken(token)).rejects.toThrow(/sub claim/i);
  });

  it('rejects an unknown kid and does not accept a token from an unpublished key', async () => {
    const token = makeToken({ header: { kid: 'never-published' } });
    await expect(verifyCognitoToken(token)).rejects.toThrow(/Signing key/i);
  });

  it('fails when the JWKS endpoint errors', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    await expect(verifyCognitoToken(makeToken())).rejects.toThrow(/JWKS fetch failed/i);
  });

  it('fails when the JWKS publishes no usable RS256 key', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ keys: [{ kid: 'x', kty: 'EC' }] }),
    });
    await expect(verifyCognitoToken(makeToken())).rejects.toThrow(/no usable RS256 signing key/i);
  });
});
