import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUnique = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: { therapist: { findUnique } },
}));

// `authConfig` is imported after the mock so the sign-in callback's dynamic
// `await import('@/lib/prisma')` resolves to the mocked module above.
const { authConfig } = await import('@/lib/auth');

describe('sign-in allowlist (§8: a Google account alone is never sufficient)', () => {
  beforeEach(() => {
    findUnique.mockReset();
    delete process.env.LOCAL_DEV_BYPASS_AUTH;
  });

  it('rejects a Google account with no matching Therapist row', async () => {
    findUnique.mockResolvedValue(null);
    const result = await authConfig.callbacks!.signIn!({
      account: { provider: 'google' },
      profile: { email: 'stranger@gmail.com' },
    } as never);
    expect(result).toBe('/auth?error=unauthorized');
  });

  it('allows a Google account with a matching Therapist row', async () => {
    findUnique.mockResolvedValue({ id: 'th_1', email: 'therapist@evia.dev' });
    const result = await authConfig.callbacks!.signIn!({
      account: { provider: 'google' },
      profile: { email: 'therapist@evia.dev' },
    } as never);
    expect(result).toBe(true);
    expect(findUnique).toHaveBeenCalledWith({ where: { email: 'therapist@evia.dev' } });
  });

  it('allows non-Google sign-in attempts to pass through unchecked', async () => {
    const result = await authConfig.callbacks!.signIn!({
      account: { provider: 'credentials' },
      profile: undefined,
    } as never);
    expect(result).toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
