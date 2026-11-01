'use client';

import { useState, type FormEvent } from 'react';
import { copy } from '@/lib/marketing/copy';

/**
 * The landing page's only write. Posts to /api/waitlist, which is exempted
 * from the auth redirect in proxy.ts.
 *
 * Three details that are not decoration:
 *   - the honeypot field is present in the DOM but visually removed and
 *     marked aria-hidden, so a screen reader never announces it;
 *   - the consent checkbox is required by the API as well as the UI, so a
 *     crafted request cannot skip it;
 *   - a duplicate email returns the same success state as a new one, which is
 *     why this component never says "you were already on the list".
 *
 * Restyled in the 1 Nov 2026 redesign: the form now sits on a white card
 * inside the dawn band, so its colours come from .mk-* classes rather than
 * assuming the dark purple panel it used to live in.
 */
export default function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [company, setCompany] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setError(copy.wait.errorEmail);
      return;
    }

    setState('sending');
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), consent, company }),
      });
      if (!response.ok) {
        throw new Error(String(response.status));
      }
      setState('done');
    } catch {
      setState('idle');
      setError(copy.wait.errorNetwork);
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
          {error}
        </p>
      )}
      <p className="mk-form-micro">{copy.wait.micro}</p>
    </form>
  );
}
