import {
  createPublicKey,
  timingSafeEqual,
  verify as cryptoVerify,
  type JsonWebKey as NodeJsonWebKey,
  type KeyObject,
} from 'node:crypto';

/**
 * Amazon Cognito access-token verification.
 *
 * Replaces `firebase-auth.ts`. The mobile client authenticates directly
 * against a Cognito user pool (phone + SMS OTP), so the API never mints tokens
 * — it only proves that the bearer token it was handed was issued by *our*
 * pool for *our* app client, and extracts the `sub` claim, which is what
 * `User.auth_subject` stores.
 *
 * Design constraints that shaped this:
 *
 * - **No AWS SDK, no new dependency.** Verification is RS256 over the pool's
 *   public JWKS, which `node:crypto` does natively. Adding `aws-jwt-verify`
 *   would mean another package in the API's already-large surface for
 *   ~120 lines of well-understood code, and the SDK is unnecessary because
 *   JWKS is public, unauthenticated and cacheable.
 * - **No network call per request.** Keys are cached for an hour and only
 *   refetched when a token arrives signed by a `kid` we have never seen
 *   (Cognito rotates keys) — with a 30 s floor so a stream of forged `kid`s
 *   cannot turn the API into a JWKS-fetch amplifier.
 * - **Fail closed.** Missing config, unknown `alg`, wrong `token_use`, wrong
 *   audience, bad signature or expired `exp` all throw; the auth middleware
 *   turns every throw into a 401. There is no "dev passes everything" path
 *   here — that lives in the middleware, gated on `LOCAL_DEV_BYPASS_AUTH`,
 *   which the portal's boot guard already forbids in production.
 */

export interface CognitoConfig {
  region: string;
  userPoolId: string;
  clientId: string;
  issuer: string;
}

export class CognitoTokenError extends Error {
  constructor(message: string, readonly reason: string) {
    super(message);
    this.name = 'CognitoTokenError';
  }
}

interface Jwk {
  kid?: string;
  kty: string;
  n?: string;
  e?: string;
  alg?: string;
  use?: string;
}

interface DecodedToken {
  header: { alg?: string; kid?: string };
  payload: {
    sub?: string;
    iss?: string;
    aud?: string;
    client_id?: string;
    token_use?: string;
    exp?: number;
    nbf?: number;
    iat?: number;
  };
  signingInput: string;
  signature: Buffer;
}

/** 1 hour: long enough that steady-state traffic never fetches, short enough that a rotated-away key stops being accepted. */
const JWKS_TTL_MS = 60 * 60 * 1000;
/** Never refetch more than once per 30 s, however many unknown `kid`s arrive. */
const JWKS_MIN_REFETCH_MS = 30 * 1000;
/** Tolerated clock skew between Cognito and this host, in seconds. */
const CLOCK_SKEW_S = 60;

let keyCache: { keys: Map<string, KeyObject>; fetchedAt: number } | null = null;

/**
 * Resolve pool config from the environment. `iss` is derived from region+pool
 * rather than configured separately so the two can never disagree — a mismatched
 * issuer is the single most common cause of "valid token, 401" confusion.
 */
export function resolveCognitoConfig(): CognitoConfig {
  const region = process.env.COGNITO_REGION ?? process.env.AWS_REGION ?? 'ap-south-1';
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_CLIENT_ID;

  if (!userPoolId || !clientId) {
    throw new CognitoTokenError(
      'COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID must both be set to verify client tokens.',
      'config_missing',
    );
  }

  return {
    region,
    userPoolId,
    clientId,
    issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
  };
}

function jwksUrl(config: CognitoConfig): string {
  return `${config.issuer}/.well-known/jwks.json`;
}

function base64UrlToBuffer(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const buffer = Buffer.from(padded, 'base64');
  if (buffer.length === 0) throw new CognitoTokenError('Malformed token segment', 'malformed');
  return buffer;
}

function decodeSegment<T>(segment: string): T {
  const buffer = base64UrlToBuffer(segment);
  // ensureUtf8: a truncated/odd byte sequence must not silently decode.
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer)) as T;
}

function decodeToken(token: string): DecodedToken {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new CognitoTokenError('Token is not a three-part JWS', 'malformed');
  }

  const [headerSegment, payloadSegment, signatureSegment] = parts as [string, string, string];

  let header: DecodedToken['header'];
  let payload: DecodedToken['payload'];
  try {
    header = decodeSegment<DecodedToken['header']>(headerSegment);
    payload = decodeSegment<DecodedToken['payload']>(payloadSegment);
  } catch (err) {
    if (err instanceof CognitoTokenError) throw err;
    throw new CognitoTokenError('Token header or payload is not valid JSON', 'malformed');
  }

  return {
    header,
    payload,
    signingInput: `${headerSegment}.${payloadSegment}`,
    signature: base64UrlToBuffer(signatureSegment),
  };
}

async function fetchJwks(config: CognitoConfig): Promise<Map<string, KeyObject>> {
  const url = jwksUrl(config);
  const response = await fetch(url);

  if (!response.ok) {
    throw new CognitoTokenError(
      `JWKS fetch failed with HTTP ${response.status} from ${url}`,
      'jwks_unavailable',
    );
  }

  const body = (await response.json()) as { keys?: Jwk[] };
  const keys = new Map<string, KeyObject>();

  for (const jwk of body.keys ?? []) {
    // Ignore anything that is not a signing key this verifier understands —
    // Cognito pools can carry more than one key type over their lifetime.
    if (!jwk.kid || jwk.kty !== 'RSA' || (jwk.use && jwk.use !== 'sig')) continue;
    if (jwk.alg && jwk.alg !== 'RS256') continue;
    keys.set(jwk.kid, createPublicKey({ key: jwk as unknown as NodeJsonWebKey, format: 'jwk' }));
  }

  if (keys.size === 0) {
    throw new CognitoTokenError('JWKS contained no usable RS256 signing key', 'jwks_unavailable');
  }

  keyCache = { keys, fetchedAt: Date.now() };
  return keys;
}

async function resolveSigningKey(kid: string, config: CognitoConfig): Promise<KeyObject> {
  const now = Date.now();

  if (keyCache && now - keyCache.fetchedAt < JWKS_TTL_MS) {
    const cached = keyCache.keys.get(kid);
    if (cached) return cached;

    // Unknown kid, fresh cache: the pool may have rotated. One refetch, rate
    // limited, before giving up.
    if (now - keyCache.fetchedAt < JWKS_MIN_REFETCH_MS) {
      throw new CognitoTokenError(`Signing key "${kid}" is not in the cached JWKS`, 'unknown_kid');
    }
  }

  const keys = await fetchJwks(config);
  const key = keys.get(kid);
  if (!key) {
    throw new CognitoTokenError(`Signing key "${kid}" is not published by the pool`, 'unknown_kid');
  }
  return key;
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Verify a Cognito token and return the identity the API keys on.
 *
 * Accepts ID tokens and access tokens: the mobile client sends whatever
 * Cognito returned, and both carry `sub`, `iss` and a verifiable signature.
 * The audience claim differs between them (`aud` for ID tokens, `client_id`
 * for access tokens), which is the only branch needed.
 */
export async function verifyCognitoToken(token: string): Promise<{ uid: string }> {
  const config = resolveCognitoConfig();
  const decoded = decodeToken(token);
  const { header, payload, signingInput, signature } = decoded;

  if (header.alg !== 'RS256') {
    throw new CognitoTokenError(
      `Unsupported token algorithm "${header.alg ?? 'none'}" — only RS256 is accepted`,
      'bad_alg',
    );
  }
  if (!header.kid) {
    throw new CognitoTokenError('Token header has no kid', 'malformed');
  }

  const key = await resolveSigningKey(header.kid, config);

  // RS256 is RSASSA-PKCS1-v1_5 with SHA-256 — `crypto.verify('RSA-SHA256', …)`
  // is exactly that, and it rejects non-canonical signatures that a naive
  // base64 compare would accept.
  if (!cryptoVerify('RSA-SHA256', Buffer.from(signingInput), key, signature)) {
    throw new CognitoTokenError('Token signature does not verify', 'bad_signature');
  }

  if (payload.iss !== config.issuer) {
    throw new CognitoTokenError('Token was issued by a different user pool', 'bad_issuer');
  }

  const tokenUse = payload.token_use;
  if (tokenUse !== 'id' && tokenUse !== 'access') {
    throw new CognitoTokenError(
      `Token use "${tokenUse ?? 'missing'}" is not accepted for API access`,
      'bad_token_use',
    );
  }

  // ID tokens name the app client in `aud`; access tokens in `client_id`.
  const audience = tokenUse === 'id' ? payload.aud : payload.client_id;
  if (!audience || !constantTimeEquals(audience, config.clientId)) {
    throw new CognitoTokenError('Token was issued for a different app client', 'bad_audience');
  }

  const nowS = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_S < nowS) {
    throw new CognitoTokenError('Token has expired', 'expired');
  }
  if (typeof payload.nbf === 'number' && payload.nbf - CLOCK_SKEW_S > nowS) {
    throw new CognitoTokenError('Token is not valid yet (nbf in the future)', 'not_yet_valid');
  }
  if (typeof payload.iat === 'number' && payload.iat - CLOCK_SKEW_S > nowS) {
    throw new CognitoTokenError('Token has an issue time in the future', 'bad_iat');
  }

  if (!payload.sub) {
    throw new CognitoTokenError('Token has no sub claim', 'malformed');
  }

  return { uid: payload.sub };
}

/** Test seam: drop the cached JWKS so a suite can start from a cold cache. */
export function __resetJwksCacheForTests(): void {
  keyCache = null;
}
