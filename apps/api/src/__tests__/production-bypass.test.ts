import { describe, it, expect } from 'vitest';
import { checkProductionBypass } from '../lib/check-production-bypass.js';

describe('production bypass startup check', () => {
  it('throws and refuses to start when NODE_ENV=production and LOCAL_DEV_BYPASS_AUTH=true', () => {
    expect(() => checkProductionBypass('production', 'true')).toThrow(
      'LOCAL_DEV_BYPASS_AUTH',
    );
  });

  it('allows startup when NODE_ENV=production and LOCAL_DEV_BYPASS_AUTH is not set', () => {
    expect(() => checkProductionBypass('production', undefined)).not.toThrow();
    expect(() => checkProductionBypass('production', 'false')).not.toThrow();
  });

  it('allows startup when LOCAL_DEV_BYPASS_AUTH=true and NODE_ENV is development', () => {
    expect(() => checkProductionBypass('development', 'true')).not.toThrow();
  });

  it('rejects "true" with strict boolean-string check, not truthy check', () => {
    expect(() => checkProductionBypass('production', 'TRUE')).not.toThrow();
    expect(() => checkProductionBypass('production', '1')).not.toThrow();
  });
});
