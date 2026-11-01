import { describe, it, expect } from 'vitest';
import { clientValidation, refusalFor } from '@/lib/marketing/waitlist-submit';

/**
 * The regression this module exists for.
 *
 * The landing page's consent box is deliberately not pre-ticked, so "typed an
 * address, pressed the button, left the box alone" is an ordinary first attempt
 * — and it used to come back as "That didn't go through. Try again, or write to
 * admin@okuvu.in." The visitor is told to retry the one step that cannot
 * succeed, at the moment they were most willing to convert.
 *
 * These tests pin the distinction: a refusal the visitor can fix is named, and
 * "try again" is reserved for failures where retrying is the actual remedy.
 */
describe('waitlist refusals', () => {
  it('asks for the consent box rather than blaming the network', () => {
    expect(clientValidation('person@example.com', false)).toBe('consent');
    expect(refusalFor(400, { error: 'consent_required' })).toBe('consent');
  });

  it('names a malformed address as an address problem', () => {
    for (const email of ['nope', 'a@b', '', 'x@y.', 'a b@example.com']) {
      expect(clientValidation(email, true), email).toBe('email');
    }
    expect(refusalFor(400, { error: 'invalid_email' })).toBe('email');
  });

  it('accepts a filled address with consent', () => {
    expect(clientValidation(' person@example.com ', true)).toBeNull();
  });

  it('keeps "try again" for failures where retrying is the remedy', () => {
    expect(refusalFor(429, { error: 'rate_limited' })).toBe('network');
    expect(refusalFor(503, { error: 'unavailable' })).toBe('network');
    expect(refusalFor(500, null)).toBe('network');
    // A proxy's HTML error page arrives as unparseable JSON.
    expect(refusalFor(502, undefined)).toBe('network');
  });

  it('treats an unknown 400 code as a transport failure, not a made-up refusal', () => {
    // Better a generic "try again" than a sentence describing a rule that no
    // longer exists in the API.
    expect(refusalFor(400, { error: 'something_new' })).toBe('network');
    expect(refusalFor(400, 'not json')).toBe('network');
  });
});
