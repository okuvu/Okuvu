import { createHmac } from 'node:crypto';

/**
 * Outbound auth for the harness's call to `apps/worker` (POST /tasks/summary).
 *
 * The worker rejects unauthenticated jobs at `verifyInternalToken` and replies
 * `401 {"code":"UNAUTHORIZED","message":"Missing Authorization header"}`. Its
 * HTTP path is only used by callers that reach it directly; apps/api enqueues
 * over SQS and never touches it. The harness calls HTTP directly, so it has to
 * sign like the worker's verifier expects:
 *
 *   Authorization: Bearer v1.<unix-seconds>.<hex HMAC-SHA256 of "v1.<seconds>">
 *
 * keyed with WORKER_INTERNAL_AUTH_SECRET. Without this the call 401s, the
 * session close fails, and every conversation in a campaign ends INCOMPLETE —
 * which is exactly what testing.okuvu.in did before this existed.
 *
 * The canonical string is defined by apps/worker/src/middleware/internal-auth.ts
 * (`signInternalAuthToken`). Keep the two byte-identical; the worker's own test
 * covers the verifier side, this file's test covers the producer side.
 */

const TOKEN_VERSION = 'v1';

export function signWorkerAuthToken(
  secret: string,
  timestampSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const signature = createHmac('sha256', secret).update(`${TOKEN_VERSION}.${timestampSeconds}`).digest('hex');
  return `${TOKEN_VERSION}.${timestampSeconds}.${signature}`;
}

/**
 * Headers for a worker job request.
 *
 * Returns `{}` when no secret is configured: the request then fails closed at
 * the worker with a 401 that is surfaced as the run's incomplete reason, rather
 * than being sent unsigned and misread as a network fault.
 */
export function workerAuthHeaders(
  secret: string | undefined,
  timestampSeconds?: number,
): Record<string, string> {
  const trimmed = secret?.trim();
  if (!trimmed) return {};
  return { authorization: `Bearer ${signWorkerAuthToken(trimmed, timestampSeconds)}` };
}
