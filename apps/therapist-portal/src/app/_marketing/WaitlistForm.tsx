'use client';

import { useState, type FormEvent } from 'react';
import { copy } from '@/lib/marketing/copy';
import {
  clientValidation,
  refusalFor,
  type WaitlistKind,
  type WaitlistRefusal,
} from '@/lib/marketing/waitlist-submit';

/**
 * The landing page's only write. Posts to /api/waitlist, which is exempted
 * from the auth redirect in proxy.ts.
 *
 * Since copy revision v1 (§13) this is two forms on one card. A client is
 * asked for an email and, optionally, whether they already have a therapist.
 * A therapist is asked for a name, an address, a practice and a rough caseload,
 * because the reply is a walkthrough rather than a place — and because a
 * therapist enquiry that arrives as a bare email cannot be answered usefully.
 * The hidden "Company" honeypot was renamed: it looked like a real field
 * someone had forgotten to remove, and `organisation` is now a field a
 * therapist actually fills in.
 *
 * Four details that are not decoration:
 *   - the honeypot field is present in the DOM but visually removed and
 *     marked aria-hidden, so a screen reader never announces it;
 *   - the consent checkbox is required by the API as well as the UI, so a
 *     crafted request cannot skip it — and the form checks it first, with its
 *     own sentence. Before this, an unticked box came back from the API as a
 *     400 and was shown as "That didn't go through. Try again", which asks the
 *     visitor to repeat the one step that cannot succeed;
 *   - an address (or a missing name) the API rejects is named as that problem,
 *     and only a real transport failure says "try again";
 *   - a duplicate email returns the same success state as a new one, which is
 *     why this component never says "you were already on the list".
 */
const REFUSAL_COPY: Record<WaitlistRefusal, string> = {
  email: copy.wait.errorEmail,
  name: copy.wait.errorName,
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
  const [kind, setKind] = useState<WaitlistKind>('client');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [practice, setPractice] = useState('');
  const [caseload, setCaseload] = useState('');
  const [hasTherapist, setHasTherapist] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<WaitlistRefusal | null>(null);

  function switchKind(next: WaitlistKind) {
    if (next === kind) return;
    setKind(next);
    // A refusal that belongs to the other form would be answered by the wrong
    // fields on screen.
    setError(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const local = clientValidation({ kind, email, consent, name });
    if (local) {
      setError(local);
      return;
    }

    setState('sending');
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind,
          email: email.trim(),
          consent,
          name: kind === 'therapist' ? name.trim() : undefined,
          organisation: kind === 'therapist' ? practice.trim() : undefined,
          caseload: kind === 'therapist' ? caseload.trim() : undefined,
          has_therapist:
            kind === 'client' && hasTherapist ? hasTherapist === 'yes' : undefined,
          website,
        }),
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
        <strong>
          {kind === 'therapist' ? copy.wait.successTherapistTitle : copy.wait.successTitle}
        </strong>
        <p>{kind === 'therapist' ? copy.wait.successTherapistBody : copy.wait.successBody}</p>
      </div>
    );
  }

  const therapist = kind === 'therapist';

  return (
    <div className="mk-form-card">
      <div className="mk-form-tabs" role="group" aria-label="Who is asking">
        <button
          type="button"
          className="mk-form-tab"
          aria-pressed={!therapist}
          onClick={() => switchKind('client')}
        >
          {copy.wait.tabClients}
        </button>
        <button
          type="button"
          className="mk-form-tab"
          aria-pressed={therapist}
          onClick={() => switchKind('therapist')}
        >
          {copy.wait.tabTherapists}
        </button>
      </div>

      <form onSubmit={onSubmit} noValidate className="mk-form">
        {therapist && (
          <>
            <label htmlFor="waitlist-name" className="mk-form-label">
              {copy.wait.nameLabel}
            </label>
            <input
              id="waitlist-name"
              name="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={copy.wait.namePlaceholder}
              className="mk-input"
            />
          </>
        )}

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
        </div>

        {!therapist && (
          <>
            <label htmlFor="waitlist-therapist" className="mk-form-label">
              {copy.wait.hasTherapistLabel}
            </label>
            <select
              id="waitlist-therapist"
              name="has_therapist"
              value={hasTherapist}
              onChange={(e) => setHasTherapist(e.target.value)}
              className="mk-input mk-select"
            >
              <option value="">{copy.wait.hasTherapistUnsure}</option>
              <option value="yes">{copy.wait.hasTherapistYes}</option>
              <option value="no">{copy.wait.hasTherapistNo}</option>
            </select>
          </>
        )}

        {therapist && (
          <div className="mk-form-pair">
            <div>
              <label htmlFor="waitlist-practice" className="mk-form-label">
                {copy.wait.practiceLabel}
              </label>
              <input
                id="waitlist-practice"
                name="organisation"
                type="text"
                autoComplete="organization"
                value={practice}
                onChange={(e) => setPractice(e.target.value)}
                placeholder={copy.wait.practicePlaceholder}
                className="mk-input"
              />
            </div>
            <div>
              <label htmlFor="waitlist-caseload" className="mk-form-label">
                {copy.wait.caseloadLabel}
              </label>
              <input
                id="waitlist-caseload"
                name="caseload"
                type="text"
                inputMode="numeric"
                value={caseload}
                onChange={(e) => setCaseload(e.target.value)}
                placeholder={copy.wait.caseloadPlaceholder}
                className="mk-input"
              />
            </div>
          </div>
        )}

        {/* Honeypot — hidden from people, tempting to bots. */}
        <div className="mk-visually-hidden" aria-hidden="true">
          <label htmlFor="waitlist-website">Website</label>
          <input
            id="waitlist-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
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
            {therapist ? copy.wait.consentPrefixTherapist : copy.wait.consentPrefix}{' '}
            <a href="/privacy">Privacy policy</a>
          </span>
        </label>

        {error && (
          <p className="mk-form-error" role="alert">
            {withMailto(REFUSAL_COPY[error])}
          </p>
        )}

        <button type="submit" disabled={state === 'sending'} className="mk-submit">
          {state === 'sending' ? 'Sending…' : copy.wait.submit}
        </button>
        <p className="mk-form-micro">{copy.wait.micro}</p>
      </form>
    </div>
  );
}
