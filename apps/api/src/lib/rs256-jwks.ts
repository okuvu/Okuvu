import {
  createPublicKey,
  timingSafeEqual,
  verify as cryptoVerify,
  type JsonWebKey as NodeJsonWebKey,
  type KeyObject,
} from 'node:crypto';

/**
 * Generic RS256-over-JWKS verification, used by the Google ID-token verifier
 * (`google-auth.ts`).
 *
 * `cognito-auth.ts` deliberately keeps its own copy of this logic: it is a
 * tested, security-critical module for a trust domain we are in the middle of
 * retiring, and rewriting it in the same change that introduces Google
 * sign-in would mean one regression could take out both sign-in paths. The
 * duplicated part is the key cache and the signature primitive only — every
 * policy decision (issuer, audience, expiry, which claim is the identity) is
 * made by the caller, so the two verifiers cannot silently agree on something
 * neither intended. Collapse this file into `cognito-auth.ts` when Cognito is
 * removed.
 */

export class JwtVerificationError extends Error {
  constructor(message: string, readonly reason: string) {
    super(message);
    this.name = 'JwtVerificationError';
  }
}

export interface Rs256JwtPayload {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  client_id?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  email?: string;
  email_verified?: boolean | string;
  token_use?: string;
  [claim: string]: unknown;
}

export interface Rs256VerifierOptions {
  /** Absolute JWKS URL. The cache is keyed by this, so providers never share keys. */
  jwksUrl: string;
  /** Accepted `iss` values — both Google spellings are legitimate, for example. */
  issuers: readonly string[];
  /** Accepted audience values, matched against `aud` (ID tokens) or `client_id` (access tokens). */
  audiences: readonly string[];
  /** Tolerated clock skew in seconds. Default 60. */
  clockSkewSeconds?: number;
}

interface Jwk {
  kid?: string;
  kty: string;
  n?: string;
  e?: string;
  alg?: string;
  use?: string;
}

interface DecodedJwt {
  header: { alg?: string; kid?: string };
  payload: Rs256JwtPayload;
  signingInput: string;
  signature: Buffer;
}

/** 1 hour: steady-state traffic never fetches, a rotated-away key stops verifying within the hour. */
const JWKS_TTL_MS = 60 * 60 * 1000;
/** Never refetch more than once per 30 s, however many unknown `kid`s arrive. */
const JWKS_MIN_REFETCH_MS = 30 * 1000;
const DEFAULT_CLOCK_SKEW_S = 60;

interface CachedKeys {
  keys: Map<string, KeyObject>;
  fetchedAt: number;
}

const keyCache = new Map<string, CachedKeys>();

function base64UrlToBuffer(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '=',
  );
  const buffer = Buffer.from(padded, 'base64');
  if (buffer.length === 0) {
    throw new JwtVerificationError('Malformed token segment', 'malformed');
  }
  return buffer;
}

function decodeSegment<T>(segment: string): T {
  const buffer = base64UrlToBuffer(segment);
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer)) as T;
}

function decodeToken(token: string): DecodedJwt {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new JwtVerificationError('Token is not a three-part JWS', 'malformed');
  }

  const [headerSegment, payloadSegment, signatureSegment] = parts as [
    string,
    string,
    string,
  ];

  let header: DecodedJwt['header'];
  let payload: Rs256JwtPayload;
  try {
    header = decodeSegment<DecodedJwt['header']>(headerSegment);
    payload = decodeSegment<Rs256JwtPayload>(payloadSegment);
  } catch (err) {
    if (err instanceof JwtVerificationError) throw err;
    throw new JwtVerificationError('Token header or payload is not valid JSON', 'malformed');
  }

  return {
    header,
    payload,
    signingInput: `${headerSegment}.${payloadSegment}`,
    signature: base64UrlToBuffer(signatureSegment),
  };
}

async function fetchJwks(jwksUrl: string): Promise<Map<string, KeyObject>> {
  const response = await fetch(jwksUrl);

  if (!response.ok) {
    throw new JwtVerificationError(
      `JWKS fetch failed with HTTP ${response.status} from ${jwksUrl}`,
      'jwks_unavailable',
    );
  }

  // Google publishes a bare `{kid: jwk}` map on its v3 certs endpoint and
  // `{keys: [...]}` elsewhere; accept both shapes.
  const body = (await response.json()) as { keys?: Jwk[]; [key: string]: unknown };

  const jwks: Jwk[] = Array.isArray(body.keys)
    ? body.keys
    : Object.entries(body)
        .filter(([key, value]) => key !== 'keys' && typeof value === 'object' && value !== null)
        .map(([kid, value]) => ({ kid, ...(value as Omit<Jwk, 'kid'>) }));

  const keys = new Map<string, KeyObject>();
  for (const jwk of jwks) {
    if (!jwk.kid || jwk.kty !== 'RSA' || (jwk.use && jwk.use !== 'sig')) continue;
    if (jwk.alg && jwk.alg !== 'RS256') continue;
    keys.set(jwk.kid, createPublicKey({ key: jwk as unknown as NodeJsonWebKey, format: 'jwk' }));
  }

  if (keys.size === 0) {
    throw new JwtVerificationError('JWKS contained no usable RS256 signing key', 'jwks_unavailable');
  }

  keyCache.set(jwksUrl, { keys, fetchedAt: Date.now() });
  return keys;
}

async function resolveSigningKey(kid: string, jwksUrl: string): Promise<KeyObject> {
  const now = Date.now();
  const cached = keyCache.get(jwksUrl);

  if (cached && now - cached.fetchedAt < JWKS_TTL_MS) {
    const key = cached.keys.get(kid);
    if (key) return key;

    if (now - cached.fetchedAt < JWKS_MIN_REFETCH_MS) {
      throw new JwtVerificationError(`Signing key "${kid}" is not in the cached JWKS`, 'unknown_kid');
    }
  }

  const keys = await fetchJwks(jwksUrl);
  const key = keys.get(kid);
  if (!key) {
    throw new JwtVerificationError(`Signing key "${kid}" is not published by the issuer`, 'unknown_kid');
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
 * Verify an RS256 JWS against a JWKS URL and return its payload.
 *
 * Every check fails closed: unsupported `alg`, missing `kid`, unknown signing
 * key, bad signature, unaccepted issuer, wrong audience, expired or
 * not-yet-valid token, and a missing `sub` all throw. The caller turns a throw
 * into a 401 — there is no permissive mode here.
 */
export async function verifyRs256Jwt(
  token: string,
  options: Rs256VerifierOptions,
): Promise<Rs256JwtPayload> {
  const skew = options.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_S;
  const { header, payload, signingInput, signature } = decodeToken(token);

  if (header.alg !== 'RS256') {
    throw new JwtVerificationError(
      `Unsupported token algorithm "${header.alg ?? 'none'}" — only RS256 is accepted`,
      'bad_alg',
    );
  }
  if (!header.kid) {
    throw new JwtVerificationError('Token header has no kid', 'malformed');
  }

  const key = await resolveSigningKey(header.kid, options.jwksUrl);

  if (!cryptoVerify('RSA-SHA256', Buffer.from(signingInput), key, signature)) {
    throw new JwtVerificationError('Token signature does not verify', 'bad_signature');
  }

  if (typeof payload.iss !== 'string' || !options.issuers.includes(payload.iss)) {
    throw new JwtVerificationError('Token was issued by an untrusted issuer', 'bad_issuer');
  }

  const audiences = Array.isArray(payload.aud)
    ? payload.aud
    : [payload.aud, payload.client_id].filter((value): value is string => typeof value === 'string');

  const audienceOk = audiences.some((audience) =>
    options.audiences.some((accepted) => constantTimeEquals(audience, accepted)),
  );
  if (!audienceOk) {
    throw new JwtVerificationError('Token was issued for a different client', 'bad_audience');
  }

  const nowS = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp + skew < nowS) {
    throw new JwtVerificationError('Token has expired', 'expired');
  }
  if (typeof payload.nbf === 'number' && payload.nbf - skew > nowS) {
    throw new JwtVerificationError('Token is not valid yet (nbf in the future)', 'not_yet_valid');
  }
  if (typeof payload.iat === 'number' && payload.iat - skew > nowS) {
    throw new JwtVerificationError('Token has an issue time in the future', 'bad_iat');
  }

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new JwtVerificationError('Token has no sub claim', 'malformed');
  }

  return payload;
}

/** Test seam: drop every cached JWKS so a suite can start from a cold cache. */
export function __resetRs256JwksCacheForTests(): void {
  keyCache.clear();
}
