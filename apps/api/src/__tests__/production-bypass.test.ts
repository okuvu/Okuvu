import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalExit = process.exit;

describe('production bypass startup check', () => {
  beforeEach(() => {
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws and refuses to start when NODE_ENV=production and LOCAL_DEV_BYPASS_AUTH=true', async () => {
    const { checkProductionBypass } = await import('../server.js');

    expect(() => checkProductionBypass('production', 'true')).toThrow('process.exit called');
  });

  it('allows startup when NODE_ENV=production and LOCAL_DEV_BYPASS_AUTH is not set', async () => {
    const { checkProductionBypass } = await import('../server.js');

    expect(() => checkProductionBypass('production', undefined)).not.toThrow();
    expect(() => checkProductionBypass('production', 'false')).not.toThrow();
  });

  it('allows startup when LOCAL_DEV_BYPASS_AUTH=true and NODE_ENV is development', async () => {
    const { checkProductionBypass } = await import('../server.js');

    expect(() => checkProductionBypass('development', 'true')).not.toThrow();
  });

  it('rejects "true" with strict boolean-string check, not truthy check', async () => {
    const { checkProductionBypass } = await import('../server.js');

    expect(() => checkProductionBypass('production', 'TRUE')).not.toThrow();
    expect(() => checkProductionBypass('production', '1')).not.toThrow();
  });
});
