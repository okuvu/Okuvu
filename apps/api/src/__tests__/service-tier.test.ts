import { describe, it, expect } from 'vitest';

import { decideServiceTier, DEFAULT_FLEX_TIMEOUT_MS } from '../lib/service-tier.js';

const on = { OKUVU_BEDROCK_FLEX: 'true' } as NodeJS.ProcessEnv;
const off = {} as NodeJS.ProcessEnv;

describe('service tier — the safety lane is never cheapened', () => {
  it.each(['safety', 'review'] as const)('%s stays on the guaranteed tier even with flex enabled', (role) => {
    const decision = decideServiceTier(role, on);
    expect(decision.tier).toBe('default');
    expect(decision.reason).toContain('guaranteed');
  });

  it.each(['dialogue', 'background'] as const)('%s takes the flex lane when enabled', (role) => {
    expect(decideServiceTier(role, on).tier).toBe('flex');
  });
});

describe('service tier — default behaviour is the pre-existing one', () => {
  it('unset env means every role is standard', () => {
    for (const role of ['safety', 'review', 'dialogue', 'background'] as const) {
      expect(decideServiceTier(role, off).tier).toBe('default');
    }
  });

  it('an unclassified call site is standard, not flex', () => {
    const decision = decideServiceTier(undefined, on);
    expect(decision.tier).toBe('default');
    expect(decision.reason).toBe('unclassified_call_site');
  });

  it('only the literal string "true" enables flex', () => {
    expect(decideServiceTier('dialogue', { OKUVU_BEDROCK_FLEX: '1' } as NodeJS.ProcessEnv).tier).toBe('default');
    expect(decideServiceTier('dialogue', { OKUVU_BEDROCK_FLEX: 'yes' } as NodeJS.ProcessEnv).tier).toBe('default');
  });
});

describe('service tier — queue budget', () => {
  it('is 20s, and must stay below the 30s standard timeout', () => {
    expect(DEFAULT_FLEX_TIMEOUT_MS).toBe(20_000);
    expect(DEFAULT_FLEX_TIMEOUT_MS).toBeLessThan(30_000);
  });
});
