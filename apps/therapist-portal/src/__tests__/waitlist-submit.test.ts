import { describe, it, expect } from 'vitest';
import { clientValidation, refusalFor, type WaitlistInput } from '@/lib/marketing/waitlist-submit';

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
 *
 * Since copy revision v1 (§13) there are two forms, so the same checks run for
 * both — and the therapist form is the one that can additionally fail for want
 * of a name.
 */

const client = (over: Partial<WaitlistInput> = {}): WaitlistInput => ({
  kind: 'client',
  email: 'person@example.com',
  consent: true,
  ...over,
});

const therapist = (over: Partial<WaitlistInput> = {}): WaitlistInput => ({
  kind: 'therapist',
  email: 'therapist@example.com',
  consent: true,
  name: 'A Therapist',
  ...over,
});

describe('waitlist refusals', () => {
  it('asks for the consent box rather than blaming the network', () => {
    expect(clientValidation(client({ consent: false }))).toBe('consent');
    expect(clientValidation(therapist({ consent: false }))).toBe('consent');
    expect(refusalFor(400, { error: 'consent_required' })).toBe('consent');
  });

  it('names a malformed address as an address problem', () => {
    for (const email of ['nope', 'a@b', '', 'x@y.', 'a b@example.com']) {
      expect(clientValidation(client({ email })), email).toBe('email');
      expect(clientValidation(therapist({ email })), email).toBe('email');
    }
    expect(refusalFor(400, { error: 'invalid_email' })).toBe('email');
  });

  it('accepts a filled address with consent', () => {
    expect(clientValidation(client({ email: ' person@example.com ' }))).toBeNull();
    expect(clientValidation(therapist())).toBeNull();
  });

  it('wants a name only from the therapist form', () => {
    // The client form never asks for one; a client enquiry without a name is
    // complete, not incomplete.
    expect(clientValidation(client())).toBeNull();
    expect(clientValidation(therapist({ name: '' }))).toBe('name');
    expect(clientValidation(therapist({ name: '   ' }))).toBe('name');
    expect(refusalFor(400, { error: 'name_required' })).toBe('name');
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
