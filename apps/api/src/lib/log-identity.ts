import { createHmac, randomBytes } from 'node:crypto';

/**
 * E16-S11 — log identity references (api).
 *
 * Same contract as apps/therapist-portal/src/lib/log-identity.ts: a log line
 * must never carry an address, a name or a phone number, but it still has to
 * let someone correlate two log lines about the same person. So identifying
 * values are replaced by
 *
 *     ref = "<kind>_" + HMAC-SHA256(key, normalised value)[0..12]
 *
 * which is stable for a given value and not reversible without the key.
 *
 * Kinds: c_ client address, t_ therapist id/address, u_ unmatched sign-in.
 *
 * Key: WORKER_INTERNAL_AUTH_SECRET (already injected into the api and worker
 * tasks, stable per deployment). Falls back to NEXTAUTH_SECRET, then to a
 * random per-process key — refs stay stable for one container's lifetime and
 * simply stop matching across processes, which is the safe direction.
 */

const FALLBACK_KEY = randomBytes(32).toString('hex');

function key(): string {
  return (
    process.env.WORKER_INTERNAL_AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    FALLBACK_KEY
  );
}

export type IdentityKind = 't' | 'u' | 'c';

export function identityRef(kind: IdentityKind, value: string): string {
  const digest = createHmac('sha256', key())
    .update(value.trim().toLowerCase())
    .digest('hex');
  return `${kind}_${digest.slice(0, 12)}`;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Replace every address inside an arbitrary string with its reference. */
export function redactEmails(text: string): string {
  return text.replace(EMAIL_RE, (match) => identityRef('c', match));
}
