import { describe, it, expect } from 'vitest';
import { hasDegenerateLoop } from '../lib/hard-fail-rules';

describe('hasDegenerateLoop', () => {
  it('returns false for an empty array', () => {
    expect(hasDegenerateLoop([])).toBe(false);
  });

  it('returns false for a single response', () => {
    expect(hasDegenerateLoop(['hello'])).toBe(false);
  });

  it('returns false when all responses differ', () => {
    expect(hasDegenerateLoop(['one', 'two', 'three'])).toBe(false);
  });

  it('returns true when two consecutive responses are identical', () => {
    expect(hasDegenerateLoop(['one', 'two', 'two', 'three'])).toBe(true);
  });

  it('ignores null/undefined responses (e.g. the crisis silence path) rather than treating them as a match', () => {
    expect(hasDegenerateLoop(['one', null, null, 'two'])).toBe(false);
    expect(hasDegenerateLoop([null, undefined])).toBe(false);
  });

  it('does not flag non-consecutive repeats', () => {
    expect(hasDegenerateLoop(['one', 'two', 'one'])).toBe(false);
  });
});
