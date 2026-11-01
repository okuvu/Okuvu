/**
 * What the landing page's forms say when they refuse.
 *
 * Extracted from the component so the mapping can be tested without a DOM —
 * this is the logic that produced the page's worst moment so far: an unticked
 * consent box answered with "That didn't go through. Try again", which tells
 * the visitor to retry the exact action that will keep failing. A refusal the
 * visitor can act on is the whole point of the message.
 *
 * Since copy revision v1 there are two forms (§13): a client asking for a
 * place, and a therapist asking for a walkthrough. They fail in the same ways —
 * a bad address, a missing name, an unticked consent box — so they share one
 * refusal vocabulary rather than growing two.
 *
 * The API is the authority on *why* (it enforces consent itself, so a crafted
 * request cannot skip it), and this module only translates its answer. A
 * status the API does not use for a refusal — 429, 5xx, a proxy's HTML error
 * page — stays "network": retrying is genuinely the right advice there.
 */

export type WaitlistRefusal = 'email' | 'name' | 'consent' | 'network';

export type WaitlistKind = 'client' | 'therapist';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Everything either form can post. Only some fields apply to each. */
export type WaitlistInput = {
  kind: WaitlistKind;
  email: string;
  consent: boolean;
  name?: string;
};

/** Checks the browser can make before a request is worth sending. */
export function clientValidation(input: WaitlistInput): WaitlistRefusal | null {
  if (!EMAIL_RE.test(input.email.trim())) return 'email';
  // A therapist enquiry gets a reply from a person, so it needs a name to
  // address. The client form does not ask for one and must not start.
  if (input.kind === 'therapist' && !(input.name ?? '').trim()) return 'name';
  if (!input.consent) return 'consent';
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
    if (code === 'name_required') return 'name';
  }
  return 'network';
}
