import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Okuvu's own session token.
 *
 * Why this exists: the mobile client used to hold a Cognito token. Sign-in is
 * now Google (no SMS, so no TRAI DLT registration before launch), and a Google
 * ID token has a one-hour lifetime and no refresh token — sending it on every
 * API call would sign a therapy client out mid-conversation. Instead
 * `POST /auth/google` verifies the Google token once and mints this token, which
 * the app stores and sends as its bearer.
 *
 * Shape and limits, deliberately:
 *
 * - **HS256, one secret.** The key lives in `OKUVU_SESSION_SECRET` (Secrets
 *   Manager in AWS, `.env` locally). Symmetric is correct here: we both mint and
 *   verify, so there is no third party to publish a public key to.
 * - **30 days.** Long enough that a client is not asked to sign in again on a
 *   normal cadence, short enough that a leaked token is not permanent. There is
 *   no refresh or revocation list in this revision — `signOut` on the device
 *   deletes the token, and rotating `OKUVU_SESSION_SECRET` invalidates every
 *   session at once. Per-user revocation needs a store we do not have yet.
 * - **Identity only.** `sub` is the Google subject — the value
 *   `User.auth_subject` stores — so every downstream route, which reads
 *   `request.user.uid`, is unchanged. No role, no email, no PII in the token
 *   beyond what the API already keys on.
 * - **Fail closed.** Missing or short secret, wrong alg, bad signature, wrong
 *   issuer/audience, expired: all throw. The middleware turns a throw into 401.
 */

export const SESSION_ISSUER = 'okuvu-api';
export const SESSION_AUDIENCE = 'okuvu-mobile';

/** 30 days. */
const TTL_SECONDS = 30 * 24 * 60 * 60;
const CLOCK_SKEW_S = 60;
/** HS256 keys shorter than the hash output are a foot-gun; refuse them. */
const MIN_SECRET_LENGTH = 32;

export class SessionTokenError extends Error {
  constructor(message: string, readonly reason: string) {
    super(message);
    this.name = 'SessionTokenError';
  }
}

interface SessionPayload {
  sub: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  /** Accepted if present; we never mint one ourselves. */
  nbf?: number;
}

function secret(): Buffer {
  const raw = process.env.OKUVU_SESSION_SECRET?.trim();
  if (!raw || raw.length < MIN_SECRET_LENGTH) {
    throw new SessionTokenError(
      `OKUVU_SESSION_SECRET must be set and at least ${MIN_SECRET_LENGTH} characters long.`,
      'config_missing',
    );
  }
  return Buffer.from(raw, 'utf8');
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToBuffer(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '=',
  );
  return Buffer.from(padded, 'base64');
}

function sign(signingInput: string, key: Buffer): Buffer {
  return createHmac('sha256', key).update(signingInput).digest();
}

export interface MintedSession {
  token: string;
  /** Unix seconds — what the client stores to know when to re-authenticate. */
  expiresAt: number;
}

/**
 * Mint a session token for an already-verified identity.
 *
 * Only ever called after a Google ID token verified, or (for tests) with a
 * fixture subject. It performs no verification of its own.
 */
export function mintSessionToken(subject: string): MintedSession {
  if (!subject) {
    throw new SessionTokenError('Cannot mint a session token without a subject', 'bad_subject');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: subject,
    iss: SESSION_ISSUER,
    aud: SESSION_AUDIENCE,
    iat: now,
    exp: now + TTL_SECONDS,
  };

  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64Url(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const signature = base64Url(sign(signingInput, secret()));

  return { token: `${signingInput}.${signature}`, expiresAt: payload.exp };
}

/**
 * True when the token's (unverified) issuer is ours.
 *
 * Used by the auth middleware only to choose *which* verifier to run, so a
 * session token never causes a Cognito JWKS fetch. It is not a security
 * decision: `verifySessionToken` still checks the signature, issuer, audience
 * and expiry on every call.
 */
export function looksLikeSessionToken(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(base64UrlToBuffer(parts[1] as string).toString('utf8')) as {
      iss?: unknown;
    };
    return payload.iss === SESSION_ISSUER;
  } catch {
    return false;
  }
}

export async function verifySessionToken(token: string): Promise<{ uid: string }> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new SessionTokenError('Token is not a three-part JWS', 'malformed');
  }
  const [headerSegment, payloadSegment, signatureSegment] = parts as [
    string,
    string,
    string,
  ];

  let header: { alg?: string };
  let payload: SessionPayload;
  try {
    header = JSON.parse(base64UrlToBuffer(headerSegment).toString('utf8')) as {
      alg?: string;
    };
    payload = JSON.parse(base64UrlToBuffer(payloadSegment).toString('utf8')) as SessionPayload;
  } catch {
    throw new SessionTokenError('Token header or payload is not valid JSON', 'malformed');
  }

  if (header.alg !== 'HS256') {
    throw new SessionTokenError(
      `Unsupported token algorithm "${header.alg ?? 'none'}" — only HS256 is accepted`,
      'bad_alg',
    );
  }

  const expected = sign(`${headerSegment}.${payloadSegment}`, secret());
  const actual = base64UrlToBuffer(signatureSegment);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new SessionTokenError('Token signature does not verify', 'bad_signature');
  }

  if (payload.iss !== SESSION_ISSUER) {
    throw new SessionTokenError('Token was issued by a different issuer', 'bad_issuer');
  }
  if (payload.aud !== SESSION_AUDIENCE) {
    throw new SessionTokenError('Token was issued for a different audience', 'bad_audience');
  }

  const nowS = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_S < nowS) {
    throw new SessionTokenError('Token has expired', 'expired');
  }
  if (typeof payload.nbf === 'number' && payload.nbf - CLOCK_SKEW_S > nowS) {
    throw new SessionTokenError('Token is not valid yet', 'not_yet_valid');
  }

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new SessionTokenError('Token has no sub claim', 'malformed');
  }

  return { uid: payload.sub };
}
