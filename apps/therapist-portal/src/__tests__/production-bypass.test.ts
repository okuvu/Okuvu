import { describe, it, expect } from 'vitest';
import { checkProductionBypass } from '../../instrumentation';

describe('production bypass startup check (F-01)', () => {
  it('throws and refuses to start when NODE_ENV=production and LOCAL_DEV_BYPASS_AUTH=true', () => {
    expect(() => checkProductionBypass('production', 'true')).toThrow(
      'LOCAL_DEV_BYPASS_AUTH',
    );
  });

  it('allows startup when NODE_ENV=production and the flag is unset or false', () => {
    expect(() => checkProductionBypass('production', undefined)).not.toThrow();
    expect(() => checkProductionBypass('production', 'false')).not.toThrow();
  });

  it('allows the flag in non-production environments', () => {
    expect(() => checkProductionBypass('development', 'true')).not.toThrow();
    expect(() => checkProductionBypass(undefined, 'true')).not.toThrow();
  });
});
