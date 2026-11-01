/**
 * What the landing page's one form says when it refuses.
 *
 * Extracted from the component so the mapping can be tested without a DOM —
 * this is the logic that produced the page's worst moment so far: an unticked
 * consent box answered with "That didn't go through. Try again", which tells
 * the visitor to retry the exact action that will keep failing. A refusal the
 * visitor can act on is the whole point of the message.
 *
 * The API is the authority on *why* (it enforces consent itself, so a crafted
 * request cannot skip it), and this module only translates its answer. A
 * status the API does not use for a refusal — 429, 5xx, a proxy's HTML error
 * page — stays "network": retrying is genuinely the right advice there.
 */

export type WaitlistRefusal = 'email' | 'consent' | 'network';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Checks the browser can make before a request is worth sending. */
export function clientValidation(email: string, consent: boolean): WaitlistRefusal | null {
  if (!EMAIL_RE.test(email.trim())) return 'email';
  if (!consent) return 'consent';
  return null;
}

/** Maps a non-2xx response to the sentence the form shows. */
export function refusalFor(status: number, payload: unknown): WaitlistRefusal {
  const code =
    payload && typeof payload === 'object' && 'error' in payload
      ? (payload as { error?: unknown }).error
      : undefined;

  if (status === 400) {
    if (code === 'consent_required') return 'consent';
    if (code === 'invalid_email') return 'email';
  }
  return 'network';
}
