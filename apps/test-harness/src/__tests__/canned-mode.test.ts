import { describe, it, expect } from 'vitest';
import { shouldUseCanned } from '../lib/canned-mode';

describe('shouldUseCanned', () => {
  it('returns true for sandbox', () => {
    expect(shouldUseCanned('sandbox')).toBe(true);
  });

  it('returns false for staging', () => {
    expect(shouldUseCanned('staging')).toBe(false);
  });

  it('returns false for beta', () => {
    expect(shouldUseCanned('beta')).toBe(false);
  });
});
