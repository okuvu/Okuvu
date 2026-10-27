import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const findUnique = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: { therapist: { findUnique } },
}));

// `authConfig` is imported after the mock so the sign-in callback's dynamic
// `await import('@/lib/prisma')` resolves to the mocked module above.
const { authConfig, buildProviders } = await import('@/lib/auth');

const COGNITO_ENV_KEYS = [
  'COGNITO_THERAPIST_CLIENT_ID',
  'COGNITO_THERAPIST_CLIENT_SECRET',
  'COGNITO_ISSUER',
] as const;

function clearCognitoEnv() {
  for (const key of COGNITO_ENV_KEYS) delete process.env[key];
}

function setCognitoEnv() {
  process.env.COGNITO_THERAPIST_CLIENT_ID = 'therapist-client-id';
  process.env.COGNITO_THERAPIST_CLIENT_SECRET = 'therapist-client-secret';
  process.env.COGNITO_ISSUER =
    'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_XXXXXXXX';
}

describe('sign-in allowlist (§8: a Cognito identity alone is never sufficient)', () => {
  beforeEach(() => {
    findUnique.mockReset();
    delete process.env.LOCAL_DEV_BYPASS_AUTH;
  });

  it('rejects a Cognito user with no matching Therapist row', async () => {
    findUnique.mockResolvedValue(null);
    const result = await authConfig.callbacks!.signIn!({
      account: { provider: 'cognito' },
      profile: { email: 'stranger@example.com' },
    } as never);
    expect(result).toBe('/auth?error=unauthorized');
  });

  it('allows a Cognito user with a matching Therapist row', async () => {
    findUnique.mockResolvedValue({ id: 'th_1', email: 'therapist@okuvu.dev' });
    const result = await authConfig.callbacks!.signIn!({
      account: { provider: 'cognito' },
      profile: { email: 'therapist@okuvu.dev' },
    } as never);
    expect(result).toBe(true);
    expect(findUnique).toHaveBeenCalledWith({ where: { email: 'therapist@okuvu.dev' } });
  });

  it('allows non-Cognito sign-in attempts to pass through unchecked', async () => {
    const result = await authConfig.callbacks!.signIn!({
      account: { provider: 'credentials' },
      profile: undefined,
    } as never);
    expect(result).toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('redirects to server_error when the database lookup throws', async () => {
    findUnique.mockRejectedValue(new Error('connection reset'));
    const result = await authConfig.callbacks!.signIn!({
      account: { provider: 'cognito' },
      profile: { email: 'therapist@okuvu.dev' },
    } as never);
    expect(result).toBe('/auth?error=server_error');
  });

  it('short-circuits to true under LOCAL_DEV_BYPASS_AUTH without touching the database', async () => {
    process.env.LOCAL_DEV_BYPASS_AUTH = 'true';
    try {
      const result = await authConfig.callbacks!.signIn!({
        account: { provider: 'cognito' },
        profile: { email: 'nobody@example.com' },
      } as never);
      expect(result).toBe(true);
      expect(findUnique).not.toHaveBeenCalled();
    } finally {
      delete process.env.LOCAL_DEV_BYPASS_AUTH;
    }
  });
});

describe('Cognito provider list', () => {
  beforeEach(() => {
    clearCognitoEnv();
  });

  afterEach(() => {
    clearCognitoEnv();
  });

  it('is empty when the Cognito therapist client config is absent', () => {
    expect(buildProviders()).toEqual([]);
  });

  it('is empty when the config is only partially provided', () => {
    process.env.COGNITO_THERAPIST_CLIENT_ID = 'therapist-client-id';
    process.env.COGNITO_THERAPIST_CLIENT_SECRET = 'therapist-client-secret';
    expect(buildProviders()).toEqual([]);
  });

  it('contains the cognito provider built from the therapist pool config', () => {
    setCognitoEnv();
    const providers = buildProviders() as Array<{
      id: string;
      type: string;
      options?: Record<string, unknown>;
    }>;

    expect(providers).toHaveLength(1);
    expect(providers[0].id).toBe('cognito');
    expect(providers[0].type).toBe('oauth');
    expect(providers[0].options).toMatchObject({
      clientId: 'therapist-client-id',
      clientSecret: 'therapist-client-secret',
      issuer: 'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_XXXXXXXX',
    });
    // No Google provider may survive the cutover.
    expect(providers.map((provider) => provider.id)).not.toContain('google');
  });
});
