import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getISTDateString } from '../index';

describe('getISTDateString()', () => {
  beforeEach(() => {
     vi.useRealTimers();
  });

  it('uses current time when no date parameter provided', () => {
    const now = new Date('2026-07-15T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const result = getISTDateString();

    vi.useRealTimers(); 
    expect(result).toBe('2026-07-15');
  });

  it('respects a custom Date parameter', () => {
    const testDate = new Date('2026-07-15T12:00:00.000Z');

    const result = getISTDateString(testDate);

    expect(result).toBe('2026-07-15');
  });

  it('handles the UTC → IST boundary regression', () => {
    const testCases = [
      { utcInput: '2026-07-14T18:30:00.000Z', expectedIST: '2026-07-15' },
      { utcInput: '2026-07-15T20:00:00.000Z', expectedIST: '2026-07-16' },
      { utcInput: '2026-07-15T20:00:00.001Z', expectedIST: '2026-07-16' },
    ];

    testCases.forEach(({ utcInput, expectedIST }) => {
      const utcDate = new Date(utcInput);
      const result = getISTDateString(utcDate);
      expect(result).toBe(expectedIST);
    });
  });

  it('returns a valid YYYY-MM-DD formatted string', () => {
    const testCases = [
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-12-31T23:59:59.999Z'),
      new Date('2028-02-29T12:00:00.000Z'),
    ];

    testCases.forEach(testDate => {
      const result = getISTDateString(testDate);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
