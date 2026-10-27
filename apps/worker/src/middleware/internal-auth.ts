/**
 * Inbound authentication for the worker's job endpoints.
 *
 * ## Why this replaced the platform ID-token verifier
 *
 * The worker used to run on a managed container platform that minted signed
 * ID tokens for the queue it received jobs from, and verified them with that
 * platform's ID-token library. On AWS the worker is an ECS service behind an
 * **internal ALB** (with ECS Service Connect for service-to-service calls).
 * There is no platform-issued bearer token on that path, so the verifier was
 * replaced rather than ported. The trust model now has three layers:
 *
 *  1. **Network boundary — the primary control.** The ALB scheme is `internal`
 *     and its security group only admits the caller's security group on the
 *     worker port; the task has no public IP. Unauthenticated internet traffic
 *     cannot reach this process at all.
 *  2. **Shared-secret HMAC on the request (defence in depth).** Callers must
 *     send `Authorization: Bearer v1.<unix-seconds>.<hex>` where the hex is
 *     HMAC-SHA256 over the string `v1.<unix-seconds>`, keyed with
 *     `WORKER_INTERNAL_AUTH_SECRET` (injected into the task from AWS Secrets
 *     Manager). This is the Signature-v4 idea reduced to what a single
 *     internal hop needs — a key, a timestamp and a signature over a canonical
 *     string — implemented with `node:crypto` only: no AWS SDK, no Google
 *     library, no per-request network call. It keeps a misconfigured listener,
 *     a stray in-VPC caller, or a leaked ALB DNS name from triggering summary
 *     jobs (each job reads a user's transcript and writes clinical records).
 *  3. **Replay window.** A timestamp more than
 *     `WORKER_INTERNAL_AUTH_MAX_SKEW_SECONDS` (default 300) away from now —
 *     either direction — is rejected, so a captured header is not usable
 *     indefinitely.
 *
 * Fail-closed: if `WORKER_INTERNAL_AUTH_SECRET` is unset or empty, every
 * request is rejected (401). A missing secret must never mean "open".
 * `LOCAL_DEV_BYPASS_AUTH=true` skips verification for local runs and is
 * refused at boot when `NODE_ENV=production` (see `server.ts`).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { FastifyReply, FastifyRequest } from 'fastify';

const TOKEN_VERSION = 'v1';
const DEFAULT_MAX_SKEW_SECONDS = 300;
const SIGNATURE_PATTERN = /^v1\.(\d{1,12})\.([0-9a-f]{64})$/;

function isBypassEnabled(): boolean {
  return process.env.LOCAL_DEV_BYPASS_AUTH === 'true';
}

function resolveSecret(): string | null {
  const raw = process.env.WORKER_INTERNAL_AUTH_SECRET;
  if (raw === undefined || raw.trim() === '') return null;
  return raw.trim();
}

function resolveMaxSkewSeconds(): number {
  const raw = process.env.WORKER_INTERNAL_AUTH_MAX_SKEW_SECONDS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_MAX_SKEW_SECONDS;

  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_SKEW_SECONDS;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function sign(secret: string, timestamp: number): string {
  return createHmac('sha256', secret).update(`${TOKEN_VERSION}.${timestamp}`).digest('hex');
}

/**
 * Builds the header value a caller sends. Exported so callers (and tests) have
 * one definition of the canonical string; the producer lives outside this app,
 * so keep that implementation byte-identical.
 */
export function signInternalAuthToken(secret: string, timestamp: number = nowSeconds()): string {
  return `${TOKEN_VERSION}.${timestamp}.${sign(secret, timestamp)}`;
}

/**
 * Constant-time verification of a token. Returns false — never throws — for a
 * malformed token, a stale/future timestamp, or a wrong/forged signature.
 */
export function verifyInternalAuthToken(
  token: string,
  secret: string,
  atSeconds: number = nowSeconds(),
  maxSkewSeconds: number = resolveMaxSkewSeconds(),
): boolean {
  const match = SIGNATURE_PATTERN.exec(token.trim());
  if (!match) return false;

  const timestamp = Number(match[1]);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(atSeconds - timestamp) > maxSkewSeconds) return false;

  const expected = Buffer.from(sign(secret, timestamp), 'hex');
  const provided = Buffer.from(match[2], 'hex');
  if (expected.length !== provided.length) return false;

  return timingSafeEqual(expected, provided);
}

export async function verifyInternalToken(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (isBypassEnabled()) {
    return;
  }

  const authHeader = request.headers.authorization;

  if (!authHeader) {
    reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing Authorization header',
      },
    });
    return;
  }

  const secret = resolveSecret();
  if (!secret) {
    // Fail closed and say why in the log: an unset secret is an operator
    // error, not a client error, and must be visible on the way in.
    request.log.error(
      { event: 'internal_auth_secret_missing' },
      'WORKER_INTERNAL_AUTH_SECRET is not configured — refusing every job request',
    );
    reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired internal auth token',
      },
    });
    return;
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  if (!verifyInternalAuthToken(token, secret)) {
    request.log.warn(
      { event: 'internal_auth_rejected' },
      'Signature verification failed for worker job request',
    );
    reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired internal auth token',
      },
    });
  }
}
