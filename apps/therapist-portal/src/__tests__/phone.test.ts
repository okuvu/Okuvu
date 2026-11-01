import { describe, expect, it } from 'vitest';
import { toE164 } from '@/lib/phone';

// The Add-client forms used to send the field straight to `admin.assignClient`,
// whose zod regex only accepts E.164. A therapist typing the 10 digits off an
// intake form got a raw zod error and no way to tell what to change.
describe('toE164', () => {
  it('prefixes +91 for a bare 10-digit Indian mobile', () => {
    expect(toE164('9432936553')).toBe('+919432936553');
  });

  it('keeps spaces, dashes and brackets out of the stored value', () => {
    expect(toE164(' 94329 36553 ')).toBe('+919432936553');
    expect(toE164('94329-36553')).toBe('+919432936553');
  });

  it('handles a leading 0 trunk prefix', () => {
    expect(toE164('09432936553')).toBe('+919432936553');
  });

  it('accepts 91 without the plus', () => {
    expect(toE164('919432936553')).toBe('+919432936553');
  });

  it('passes an already-normalised number through unchanged', () => {
    expect(toE164('+919432936553')).toBe('+919432936553');
    expect(toE164('+14155550123')).toBe('+14155550123');
  });

  it('handles the 00 international prefix', () => {
    expect(toE164('00919432936553')).toBe('+919432936553');
  });

  it('returns null for input it cannot read as a phone number', () => {
    expect(toE164('')).toBeNull();
    expect(toE164('   ')).toBeNull();
    expect(toE164('94329365')).toBeNull(); // too short
    expect(toE164('abc')).toBeNull();
    expect(toE164('+0123456789')).toBeNull(); // country code cannot start with 0
  });
});
