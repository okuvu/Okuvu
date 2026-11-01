// Phone numbers are stored in E.164 (`+919432936553`) because the client app
// sends them that way and `admin.assignClient` matches with an exact `findFirst`.
// Therapists type what they see on an intake form — a bare 10-digit Indian
// mobile — so the console normalises input instead of bouncing a zod regex
// error at them.

const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * Normalise a hand-typed phone number to E.164, assuming +91 when the caller
 * left the country code off. Returns null when the input cannot be read as an
 * E.164 number, so the form can say so in plain language.
 */
export function toE164(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  let national: string | null = null;

  if (trimmed.startsWith('+')) {
    national = digits;
  } else if (trimmed.startsWith('00')) {
    national = digits.slice(2);
  } else if (digits.length === 10) {
    national = `91${digits}`;
  } else if (digits.length === 11 && digits.startsWith('0')) {
    national = `91${digits.slice(1)}`;
  } else if (digits.length === 12 && digits.startsWith('91')) {
    national = digits;
  }

  if (!national) return null;

  const candidate = `+${national}`;
  return E164.test(candidate) ? candidate : null;
}

export const PHONE_FORMAT_HINT = '10-digit mobile (e.g. 9432936553) or full E.164 (e.g. +919432936553)';
