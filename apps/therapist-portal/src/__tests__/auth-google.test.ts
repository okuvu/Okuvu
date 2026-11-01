import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Google sign-in, added for the beta launch.
 *
 * Two things are asserted that the Cognito-only suite could not express:
 *   1. Google is strictly additive — absent env vars mean the provider list is
 *      exactly what it was before, and a deployment with neither provider
 *      still returns an empty list rather than a credentials stub.
 *   2. The operator account (admin@okuvu.in) can sign in without a Therapist
 *      row, while an unknown address still cannot. That is the whole reason
 *      the allowlist moved into `lib/admin-allowlist.ts`.
 */

const findUnique = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: { therapist: { findUnique } },
}));

const { authConfig, buildProviders } = await import('@/lib/auth');

const ENV_KEYS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'COGNITO_THERAPIST_CLIENT_ID',
  'COGNITO_THERAPIST_CLIENT_SECRET',
  'COGNITO_ISSUER',
  'ADMIN_EMAILS',
  'LOCAL_DEV_BYPASS_AUTH',
] as const;

function clearEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

function setGoogle() {
  process.env.GOOGLE_CLIENT_ID = 'google-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret';
}

function setCognito() {
  process.env.COGNITO_THERAPIST_CLIENT_ID = 'cognito-client-id';
  process.env.COGNITO_THERAPIST_CLIENT_SECRET = 'cognito-client-secret';
  process.env.COGNITO_ISSUER =
    'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_XXXXXXXX';
}

function providerIds(): string[] {
  return buildProviders().map((provider) => provider.id);
}

describe('buildProviders — Google is additive, never a stub', () => {
  beforeEach(clearEnv);
  afterEach(clearEnv);

  it('returns no provider at all when nothing is configured', () => {
    expect(providerIds()).toEqual([]);
  });

  it('adds Google when only Google is configured', () => {
    setGoogle();
    expect(providerIds()).toEqual(['google']);
  });

  it('keeps Cognito when only Cognito is configured', () => {
    setCognito();
    expect(providerIds()).toEqual(['cognito']);
  });

  it('offers both, Google first, when both are configured', () => {
    setGoogle();
    setCognito();
    expect(providerIds()).toEqual(['google', 'cognito']);
  });

  it('ignores a half-configured Google client instead of rendering a broken button', () => {
    process.env.GOOGLE_CLIENT_ID = 'google-client-id';
    expect(providerIds()).toEqual([]);
  });
});

describe('sign-in allowlist with Google', () => {
  beforeEach(() => {
    clearEnv();
    findUnique.mockReset();
  });
  afterEach(clearEnv);

  it('allows a Google user whose email has a Therapist row', async () => {
    findUnique.mockResolvedValue({ id: 'th_1' });
    const result = await authConfig.callbacks!.signIn!({
      account: { provider: 'google' },
      profile: { email: 'therapist@gmail.com' },
    } as never);
    expect(result).toBe(true);
    expect(findUnique).toHaveBeenCalledWith({ where: { email: 'therapist@gmail.com' } });
  });

  it('refuses a Google user with no Therapist row — there is no therapist signup', async () => {
    findUnique.mockResolvedValue(null);
    const result = await authConfig.callbacks!.signIn!({
      account: { provider: 'google' },
      profile: { email: 'stranger@gmail.com' },
    } as never);
    expect(result).toBe('/auth?error=unauthorized');
  });

  it('admits the operator account from ADMIN_EMAILS without querying Therapist', async () => {
    process.env.ADMIN_EMAILS = 'admin@okuvu.in, ops@okuvu.in';
    const result = await authConfig.callbacks!.signIn!({
      account: { provider: 'google' },
      profile: { email: 'admin@okuvu.in' },
    } as never);
    expect(result).toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('matches the admin allowlist case-insensitively', async () => {
    process.env.ADMIN_EMAILS = 'Admin@Okuvu.in';
    const result = await authConfig.callbacks!.signIn!({
      account: { provider: 'google' },
      profile: { email: 'admin@okuvu.in' },
    } as never);
    expect(result).toBe(true);
  });

  it('still refuses an ordinary Google user when an allowlist exists', async () => {
    process.env.ADMIN_EMAILS = 'admin@okuvu.in';
    findUnique.mockResolvedValue(null);
    const result = await authConfig.callbacks!.signIn!({
      account: { provider: 'google' },
      profile: { email: 'someone@gmail.com' },
    } as never);
    expect(result).toBe('/auth?error=unauthorized');
  });

  it('honours LOCAL_DEV_BYPASS_AUTH for Google too', async () => {
    process.env.LOCAL_DEV_BYPASS_AUTH = 'true';
    const result = await authConfig.callbacks!.signIn!({
      account: { provider: 'google' },
      profile: { email: 'anything@gmail.com' },
    } as never);
    expect(result).toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('redirects to server_error when the database lookup throws', async () => {
    findUnique.mockRejectedValue(new Error('connection reset'));
    const result = await authConfig.callbacks!.signIn!({
      account: { provider: 'google' },
      profile: { email: 'therapist@gmail.com' },
    } as never);
    expect(result).toBe('/auth?error=server_error');
  });
});
