/**
 * The client record number — the one identifier the therapist portal shows and
 * quotes.
 *
 * Shape: `<initials><birth YY><gender letter><serial>` → `SG88F0001`.
 *
 *   SG      first letter of the first and last word of the client's name
 *            (a single word gets X as its second letter)
 *   88      two digits of the birth year
 *   F       M / F / X — anything that is not Male or Female is X
 *   0001    a global serial, four digits, growing past 9999 rather than
 *           wrapping; never reused, never reissued
 *
 * Two rules this module exists to keep:
 *
 *   1. The number is minted once, at registration, and then frozen. A later
 *      correction to a name, a birth year or a gender does not renumber it.
 *      A record number that moves is worse than one that is slightly wrong:
 *      it is what a therapist writes on a paper file, quotes to a client, or
 *      cites in a supervision note.
 *   2. The serial comes from one locked counter row, not from `count(*) + 1`.
 *      Two registrations a second apart must not be handed the same number.
 *
 * The migration `20261102140000_client_record_number` carries the same rules
 * written in SQL (it cannot import this file) to number the rows that already
 * existed. `__tests__/client-code.test.ts` pins the cases that must agree.
 */

/** Stored verbatim in `User.gender`; the letter is derived, never stored. */
export const GENDER_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say'] as const;
export type GenderOption = (typeof GENDER_OPTIONS)[number];

/** The one row of `ClientCodeSequence`. */
export const CLIENT_CODE_SEQUENCE_ID = 'client_code';

export const SERIAL_DIGITS = 4;

/** The two-letter-unknown stand-in prefix used by the console for a row with
 * no number yet. Never rendered as if it were a real id. */
export const NO_CLIENT_CODE = '—';

/**
 * The gender letter. Only Male → M and Female → F are meaningful; every other
 * answer the form offers (Other, Prefer not to say, blank) collapses to X so
 * the number never encodes a guess.
 */
export function genderLetter(gender: string | null | undefined): string {
  const first = (gender ?? '').trim().charAt(0).toUpperCase();
  if (first === 'M') return 'M';
  if (first === 'F') return 'F';
  return 'X';
}

/** First letter of a word, skipping punctuation. `Dr.` → `D`; `—` → null. */
function firstLetter(word: string): string | null {
  const match = word.normalize('NFC').match(/\p{L}/u);
  return match ? match[0].toUpperCase() : null;
}

/**
 * First letter of the first word + first letter of the last word.
 * `Rajwant Singh Suvok` → `RS`; `Priya` → `PX`; unreadable input → `XX`.
 */
export function nameInitials(fullName: string | null | undefined): string {
  const words = (fullName ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'XX';

  const first = firstLetter(words[0]) ?? 'X';
  const last = words.length > 1 ? (firstLetter(words[words.length - 1]) ?? 'X') : 'X';
  return `${first}${last}`;
}

/**
 * Two digits of the birth year, read in UTC.
 *
 * UTC on purpose: a birth date is a calendar date, not an instant. Reading it
 * in local time shifts 1 January to the previous year for any server east of
 * Greenwich, which would file the client under the wrong birth year.
 */
export function birthYearTwoDigits(dateOfBirth: Date | string | null | undefined): string {
  if (!dateOfBirth) return '00';
  const date = dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth);
  if (Number.isNaN(date.getTime())) return '00';
  return String(date.getUTCFullYear() % 100).padStart(2, '0');
}

/** `1` → `0001`, `12345` → `12345` (grows; never truncates or wraps). */
export function formatSerial(serial: number): string {
  return String(serial).padStart(SERIAL_DIGITS, '0');
}

export interface ClientCodeParts {
  fullName: string | null | undefined;
  dateOfBirth: Date | string | null | undefined;
  gender: string | null | undefined;
  serial: number;
}

/** The pure rule. Everything else in this module delegates to it. */
export function buildClientCode({ fullName, dateOfBirth, gender, serial }: ClientCodeParts): string {
  return [
    nameInitials(fullName),
    birthYearTwoDigits(dateOfBirth),
    genderLetter(gender),
    formatSerial(serial),
  ].join('');
}

/** Whether the three inputs a number needs are all present and usable. */
export function hasNumberableProfile(profile: {
  full_name?: string | null;
  date_of_birth?: Date | null;
  gender?: string | null;
}): boolean {
  return Boolean(
    profile.full_name?.trim() &&
      profile.date_of_birth &&
      !Number.isNaN(new Date(profile.date_of_birth).getTime()) &&
      profile.gender?.trim(),
  );
}

/**
 * The shape of the counter this module needs — satisfied by both
 * `PrismaClient` and a transaction client, and by a hand-rolled fake in tests,
 * without dragging Prisma's generic transaction type through every caller.
 */
export interface ClientCodeCounterDb {
  clientCodeSequence: {
    upsert(args: {
      where: { id: string };
      create: { id: string; last_value: number };
      update: { last_value: { increment: number } };
      select: { last_value: true };
    }): Promise<{ last_value: number }>;
  };
}

/**
 * Take the next serial. Must be called inside the same transaction as the
 * insert it numbers: the increment holds a row lock until that transaction
 * commits, which is what stops two registrations reading the same value.
 */
export async function nextClientSerial(db: ClientCodeCounterDb): Promise<number> {
  const row = await db.clientCodeSequence.upsert({
    where: { id: CLIENT_CODE_SEQUENCE_ID },
    create: { id: CLIENT_CODE_SEQUENCE_ID, last_value: 1 },
    update: { last_value: { increment: 1 } },
    select: { last_value: true },
  });
  return row.last_value;
}

/**
 * Mint a number for a client row, or return null when the row is missing the
 * birth year or gender the rule needs. Never guesses a placeholder: a number
 * with `00` or `X` in it because nobody filled the form is a number the
 * therapist cannot rely on.
 */
export async function issueClientCode(
  db: ClientCodeCounterDb,
  profile: {
    full_name?: string | null;
    date_of_birth?: Date | null;
    gender?: string | null;
  },
): Promise<string | null> {
  if (!hasNumberableProfile(profile)) return null;
  const serial = await nextClientSerial(db);
  return buildClientCode({
    fullName: profile.full_name,
    dateOfBirth: profile.date_of_birth,
    gender: profile.gender,
    serial,
  });
}
