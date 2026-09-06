import { describe, it, expect, afterEach } from 'vitest';
import { shouldUseCanned, isCannedRunActive } from '../lib/canned-mode';

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

describe('isCannedRunActive', () => {
  const previous = process.env.USE_CANNED_LLM_RESPONSE;

  afterEach(() => {
    if (previous === undefined) delete process.env.USE_CANNED_LLM_RESPONSE;
    else process.env.USE_CANNED_LLM_RESPONSE = previous;
  });

  it('returns false when nothing is active', () => {
    delete process.env.USE_CANNED_LLM_RESPONSE;
    expect(isCannedRunActive()).toBe(false);
    expect(isCannedRunActive(false)).toBe(false);
  });

  it('returns true when the deliberate flag is true, regardless of the ambient env var', () => {
    delete process.env.USE_CANNED_LLM_RESPONSE;
    expect(isCannedRunActive(true)).toBe(true);
  });

  it('returns true when USE_CANNED_LLM_RESPONSE is ambiently set, even with no deliberate decision', () => {
    process.env.USE_CANNED_LLM_RESPONSE = 'true';
    expect(isCannedRunActive()).toBe(true);
    expect(isCannedRunActive(false)).toBe(true);
  });
});
