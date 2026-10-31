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
      <div
        className="rounded-xl border border-white/15 bg-white/5 p-6"
        role="status"
        aria-live="polite"
      >
        <p className="text-base font-semibold text-white">{copy.wait.successTitle}</p>
        <p className="mt-2 text-sm leading-relaxed text-lavender-tint/80">{copy.wait.successBody}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <label htmlFor="waitlist-email" className="block text-xs font-medium uppercase tracking-wider text-lavender-tint/70">
        {copy.wait.emailLabel}
      </label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <input
          id="waitlist-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={copy.wait.emailPlaceholder}
          className="min-w-0 flex-1 rounded-lg border border-white/20 bg-white/95 px-4 py-3 text-sm text-charcoal-ink placeholder:text-ink-soft/60 focus:border-honey focus:outline-none focus:ring-2 focus:ring-honey/40"
        />
        <button
          type="submit"
          disabled={state === 'sending'}
          className="rounded-lg bg-honey px-6 py-3 text-sm font-semibold text-royal-night transition-colors hover:bg-honey-bright disabled:opacity-60"
        >
          {state === 'sending' ? 'Sending…' : copy.wait.submit}
        </button>
      </div>

      {/* Honeypot — hidden from people, tempting to bots. */}
      <div className="absolute h-0 w-0 overflow-hidden opacity-0" aria-hidden="true">
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

      <label className="mt-4 flex items-start gap-2.5 text-xs leading-relaxed text-lavender-tint/75">
        <input
          type="checkbox"
          required
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/30 accent-honey"
        />
        <span>
          {copy.wait.consentPrefix}{' '}
          <a href="/privacy" className="underline underline-offset-2 hover:text-white">
            Privacy policy
          </a>
        </span>
      </label>

      {error && (
        <p className="mt-3 text-sm text-honey-bright" role="alert">
          {error}
        </p>
      )}
      <p className="mt-3 text-xs text-lavender-tint/50">{copy.wait.micro}</p>
    </form>
  );
}
