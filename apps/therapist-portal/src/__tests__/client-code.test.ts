import { describe, it, expect, vi } from 'vitest';
import {
  GENDER_OPTIONS,
  buildClientCode,
  birthYearTwoDigits,
  formatSerial,
  genderLetter,
  hasNumberableProfile,
  issueClientCode,
  nameInitials,
  nextClientSerial,
  type ClientCodeCounterDb,
} from '@/lib/client-code';

/**
 * The client record number.
 *
 * These cases are the contract the migration's SQL backfill also implements —
 * if one side changes, the other must, so the expectations here are written
 * from the examples the rule was specified with (`SG88F0001`, `RS86M0002`).
 */

describe('genderLetter', () => {
  it('maps only Male and Female to their letter', () => {
    expect(genderLetter('Male')).toBe('M');
    expect(genderLetter('Female')).toBe('F');
    expect(genderLetter('male')).toBe('M');
  });

  it('collapses everything else to X rather than guessing', () => {
    // The reason this field is a fixed set in the wizard: "Woman" must not
    // become a letter of its own, and a blank must not read as Male.
    expect(genderLetter('Other')).toBe('X');
    expect(genderLetter('Prefer not to say')).toBe('X');
    expect(genderLetter('Woman')).toBe('X');
    expect(genderLetter('')).toBe('X');
    expect(genderLetter(null)).toBe('X');
    expect(genderLetter(undefined)).toBe('X');
  });
});

describe('nameInitials', () => {
  it('takes the first letter of the first and last word', () => {
    expect(nameInitials('Shubhangi Goswami')).toBe('SG');
    expect(nameInitials('Rajwant Singh Suvok')).toBe('RS');
  });

  it('uses X as the second letter for a single word', () => {
    expect(nameInitials('Priya')).toBe('PX');
  });

  it('skips punctuation and collapses repeated spaces', () => {
    expect(nameInitials('  dr. shubhangi   goswami ')).toBe('DG');
  });

  it('never returns fewer than two characters', () => {
    expect(nameInitials('')).toBe('XX');
    expect(nameInitials('   ')).toBe('XX');
    expect(nameInitials(null)).toBe('XX');
  });
});

describe('birthYearTwoDigits', () => {
  it('reads the year in UTC so a January birth date does not shift', () => {
    expect(birthYearTwoDigits('1988-01-01')).toBe('88');
    expect(birthYearTwoDigits(new Date('1986-12-31T23:30:00Z'))).toBe('86');
  });

  it('returns 00 only for a missing or unparseable date', () => {
    expect(birthYearTwoDigits(null)).toBe('00');
    expect(birthYearTwoDigits('not-a-date')).toBe('00');
  });
});

describe('formatSerial', () => {
  it('pads to four digits', () => {
    expect(formatSerial(1)).toBe('0001');
    expect(formatSerial(42)).toBe('0042');
    expect(formatSerial(9999)).toBe('9999');
  });

  it('grows past four digits instead of wrapping', () => {
    // A wrap would reissue number 0001 to a second client. A longer number is
    // the only acceptable failure mode.
    expect(formatSerial(10000)).toBe('10000');
  });
});

describe('buildClientCode', () => {
  it('builds the specified shape', () => {
    expect(
      buildClientCode({
        fullName: 'Shubhangi Goswami',
        dateOfBirth: '1988-06-14',
        gender: 'Female',
        serial: 1,
      }),
    ).toBe('SG88F0001');
  });

  it('builds the second example from the brief', () => {
    expect(
      buildClientCode({
        fullName: 'Rajwant Suvok',
        dateOfBirth: '1986-02-02',
        gender: 'Male',
        serial: 2,
      }),
    ).toBe('RS86M0002');
  });

  it('is stable for a given serial — the same inputs never drift', () => {
    const parts = { fullName: 'Priya', dateOfBirth: '1990-03-05', gender: 'Other' as const, serial: 7 };
    expect(buildClientCode(parts)).toBe('PX90X0007');
    expect(buildClientCode({ ...parts, fullName: 'Priya Nair' })).toBe('PN90X0007');
  });
});

describe('GENDER_OPTIONS', () => {
  it('is the fixed set the wizard offers, in order', () => {
    expect([...GENDER_OPTIONS]).toEqual(['Male', 'Female', 'Other', 'Prefer not to say']);
  });
});

describe('hasNumberableProfile', () => {
  it('requires a name, a real birth date and a gender', () => {
    expect(
      hasNumberableProfile({ full_name: 'A B', date_of_birth: new Date('1990-01-01'), gender: 'Male' }),
    ).toBe(true);
    expect(hasNumberableProfile({ full_name: '  ', date_of_birth: new Date('1990-01-01'), gender: 'Male' })).toBe(false);
    expect(hasNumberableProfile({ full_name: 'A B', date_of_birth: null, gender: 'Male' })).toBe(false);
    expect(hasNumberableProfile({ full_name: 'A B', date_of_birth: new Date('1990-01-01'), gender: '' })).toBe(false);
  });
});

describe('nextClientSerial', () => {
  it('increments the single counter row and returns the new value', async () => {
    const upsert = vi.fn().mockResolvedValue({ last_value: 4 });
    const db = { clientCodeSequence: { upsert } } as unknown as ClientCodeCounterDb;

    expect(await nextClientSerial(db)).toBe(4);
    expect(upsert).toHaveBeenCalledWith({
      where: { id: 'client_code' },
      create: { id: 'client_code', last_value: 1 },
      update: { last_value: { increment: 1 } },
      select: { last_value: true },
    });
  });
});

describe('issueClientCode', () => {
  it('mints a number in one call for a complete profile', async () => {
    const upsert = vi.fn().mockResolvedValue({ last_value: 12 });
    const db = { clientCodeSequence: { upsert } } as unknown as ClientCodeCounterDb;

    expect(
      await issueClientCode(db, {
        full_name: 'Shubhangi Goswami',
        date_of_birth: new Date('1988-06-14T00:00:00Z'),
        gender: 'Female',
      }),
    ).toBe('SG88F0012');
  });

  it('returns null — and spends no serial — when the profile is incomplete', async () => {
    const upsert = vi.fn().mockResolvedValue({ last_value: 12 });
    const db = { clientCodeSequence: { upsert } } as unknown as ClientCodeCounterDb;

    expect(
      await issueClientCode(db, { full_name: 'Shubhangi Goswami', date_of_birth: null, gender: 'Female' }),
    ).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });
});
