import { createHmac, randomBytes } from 'node:crypto';

/**
 * E16-S11 — log identity references.
 *
 * The therapist portal used to write the full therapist email address on every
 * sign-in. In this product the email address *is* the person's name, so that
 * line was direct personal data in a log group, which is a DPDP Act defect.
 *
 * Deleting the line would have made sign-in failures undebuggable, so the
 * identifying value is replaced by a stable, non-reversible reference:
 *
 *     ref = "<kind>_" + HMAC-SHA256(key, normalised value)[0..12]
 *
 * The same value always yields the same ref (so repeated attempts by one
 * identity are correlated across log lines), but the ref cannot be reversed
 * without the key. To ask "was this the failed sign-in I am looking at?",
 * recompute the ref for a *suspected* address and compare:
 *
 *     NEXTAUTH_SECRET=... node -e '
 *       const {createHmac}=require("node:crypto");
 *       console.log("u_"+createHmac("sha256",process.env.NEXTAUTH_SECRET)
 *         .update("suspected@example.com").digest("hex").slice(0,12))'
 *
 * Kinds in use:
 *   t_  a Therapist row id (sign-in allowed)
 *   u_  an address with no Therapist row (sign-in refused) — hashed because
 *       there is no internal id to use at that point
 *   c_  a client address used by the invite/waitlist mailers
 *   a_  an address on the ADMIN_EMAILS allowlist (operator sign-in allowed,
 *       no Therapist row by design) — added with the operator account, which
 *       needs a log line that is distinguishable from a therapist's.
 *
 * Key: NEXTAUTH_SECRET (stable per deployment, so refs stay comparable across
 * restarts). If it is unset the module falls back to a random per-process key:
 * refs remain stable within one container's lifetime, they just do not line up
 * across processes — the safe direction to fail.
 */

const FALLBACK_KEY = randomBytes(32).toString('hex');

function key(): string {
  return process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || FALLBACK_KEY;
}

export type IdentityKind = 't' | 'u' | 'c' | 'a';

export function identityRef(kind: IdentityKind, value: string): string {
  const digest = createHmac('sha256', key())
    .update(value.trim().toLowerCase())
    .digest('hex');
  return `${kind}_${digest.slice(0, 12)}`;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Replace every address inside an arbitrary string (an upstream response body,
 * an error message) with its reference. Used where the value is not ours to
 * drop — a provider's error payload, say — but must not reach a log verbatim.
 */
export function redactEmails(text: string): string {
  return text.replace(EMAIL_RE, (match) => identityRef('c', match));
}
