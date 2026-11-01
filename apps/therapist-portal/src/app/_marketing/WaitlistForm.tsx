'use client';

import { useState, type FormEvent } from 'react';
import { copy } from '@/lib/marketing/copy';
import { clientValidation, refusalFor, type WaitlistRefusal } from '@/lib/marketing/waitlist-submit';

/**
 * The landing page's only write. Posts to /api/waitlist, which is exempted
 * from the auth redirect in proxy.ts.
 *
 * Four details that are not decoration:
 *   - the honeypot field is present in the DOM but visually removed and
 *     marked aria-hidden, so a screen reader never announces it;
 *   - the consent checkbox is required by the API as well as the UI, so a
 *     crafted request cannot skip it — and the form now checks it first, with
 *     its own sentence. Before this, an unticked box came back from the API as
 *     a 400 and was shown as "That didn't go through. Try again", which asks
 *     the visitor to repeat the one step that cannot succeed;
 *   - an address the API rejects is named as an address problem, and only a
 *     real transport failure says "try again";
 *   - a duplicate email returns the same success state as a new one, which is
 *     why this component never says "you were already on the list".
 *
 * Restyled in the 1 Nov 2026 redesign: the form now sits on a white card
 * inside the dawn band, so its colours come from .mk-* classes rather than
 * assuming the dark purple panel it used to live in.
 */
const REFUSAL_COPY: Record<WaitlistRefusal, string> = {
  email: copy.wait.errorEmail,
  consent: copy.wait.errorConsent,
  network: copy.wait.errorNetwork,
};

/** The address in the error text is the thing to act on, so make it a link. */
function withMailto(sentence: string) {
  const address = 'admin@okuvu.in';
  const at = sentence.indexOf(address);
  if (at === -1) return sentence;
  return (
    <>
      {sentence.slice(0, at)}
      <a href="mailto:admin@okuvu.in?subject=Okuvu%20waitlist">{address}</a>
      {sentence.slice(at + address.length)}
    </>
  );
}

export default function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [company, setCompany] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<WaitlistRefusal | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const local = clientValidation(email, consent);
    if (local) {
      setError(local);
      return;
    }

    setState('sending');
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), consent, company }),
      });
      if (response.ok) {
        setState('done');
        return;
      }
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        // A proxy's HTML error page is not our JSON; refusalFor treats it as
        // a transport failure, which is what it is.
      }
      setState('idle');
      setError(refusalFor(response.status, payload));
    } catch {
      setState('idle');
      setError('network');
    }
  }

  if (state === 'done') {
    return (
      <div className="mk-form-success" role="status" aria-live="polite">
        <strong>{copy.wait.successTitle}</strong>
        <p>{copy.wait.successBody}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mk-form">
      <label htmlFor="waitlist-email" className="mk-form-label">
        {copy.wait.emailLabel}
      </label>
      <div className="mk-form-row">
        <input
          id="waitlist-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={copy.wait.emailPlaceholder}
          className="mk-input"
        />
        <button type="submit" disabled={state === 'sending'} className="mk-submit">
          {state === 'sending' ? 'Sending…' : copy.wait.submit}
        </button>
      </div>

      {/* Honeypot — hidden from people, tempting to bots. */}
      <div className="mk-visually-hidden" aria-hidden="true">
        <label htmlFor="waitlist-company">Company</label>
        <input
          id="waitlist-company"
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </div>

      <label className="mk-consent">
        <input
          type="checkbox"
          required
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          {copy.wait.consentPrefix}{' '}
          <a href="/privacy">Privacy policy</a>
        </span>
      </label>

      {error && (
        <p className="mk-form-error" role="alert">
          {withMailto(REFUSAL_COPY[error])}
        </p>
      )}
      <p className="mk-form-micro">{copy.wait.micro}</p>
    </form>
  );
}
