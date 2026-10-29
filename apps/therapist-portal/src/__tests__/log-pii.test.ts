import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * E16-S11 — no personal data in log output.
 *
 * The 14-day CloudWatch baseline found 24 portal events carrying the full
 * therapist address (`[AUTH] Successful sign-in: <email>`), and in this product
 * the address *is* the person's name. These tests pin the replacement: the
 * sign-in path must keep logging enough to debug a failure, and must not log
 * the address, the local part, or the domain.
 */

const findUnique = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: { therapist: { findUnique } },
}));

const { authConfig } = await import('@/lib/auth');
const { identityRef, redactEmails } = await import('@/lib/log-identity');
const { sendInviteEmail } = await import('@/lib/email');

const EMAIL_SHAPED = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const THERAPIST_EMAIL = 'ananya.rao@okuvu.in';
const THERAPIST_ID = '7f2dab0c-63d8-4989-84ad-7c2440381a64';

function captured(args: unknown[]): string {
  return args
    .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
    .join(' ');
}

describe('sign-in logging carries no personal data', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    findUnique.mockReset();
    delete process.env.LOCAL_DEV_BYPASS_AUTH;
    process.env.NEXTAUTH_SECRET = 'test-secret-for-log-refs';
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    delete process.env.NEXTAUTH_SECRET;
  });

  it('logs a reference, not the address, on a successful sign-in', async () => {
    findUnique.mockResolvedValue({ id: THERAPIST_ID, email: THERAPIST_EMAIL });

    const result = await authConfig.callbacks!.signIn!({
      account: { provider: 'cognito' },
      profile: { email: THERAPIST_EMAIL },
    } as never);

    expect(result).toBe(true);
    expect(logSpy).toHaveBeenCalledTimes(1);

    const line = captured(logSpy.mock.calls[0] as unknown[]);
    expect(line).toContain('Successful sign-in');
    expect(line).not.toMatch(EMAIL_SHAPED);
    expect(line).not.toContain('ananya.rao');
    expect(line).not.toContain('okuvu.in');
    expect(line).toMatch(/therapist=t_[0-9a-f]{12}\b/);
  });

  it('logs a stable reference for the same therapist across sign-ins', async () => {
    findUnique.mockResolvedValue({ id: THERAPIST_ID, email: THERAPIST_EMAIL });

    for (let i = 0; i < 2; i++) {
      await authConfig.callbacks!.signIn!({
        account: { provider: 'cognito' },
        profile: { email: THERAPIST_EMAIL },
      } as never);
    }

    const first = captured(logSpy.mock.calls[0] as unknown[]);
    const second = captured(logSpy.mock.calls[1] as unknown[]);
    expect(first).toBe(second);
  });

  it('logs a reference, not the address, when the sign-in is refused', async () => {
    findUnique.mockResolvedValue(null);

    const result = await authConfig.callbacks!.signIn!({
      account: { provider: 'cognito' },
      profile: { email: 'stranger@example.com' },
    } as never);

    expect(result).toBe('/auth?error=unauthorized');
    expect(warnSpy).toHaveBeenCalledTimes(1);

    const line = captured(warnSpy.mock.calls[0] as unknown[]);
    expect(line).toContain('Unauthorized sign-in attempt');
    expect(line).not.toMatch(EMAIL_SHAPED);
    expect(line).not.toContain('stranger');
    expect(line).toMatch(/ref=u_[0-9a-f]{12}\b/);
  });

  it('gives two different refused identities two different references', async () => {
    findUnique.mockResolvedValue(null);

    for (const email of ['stranger@example.com', 'other@example.com']) {
      await authConfig.callbacks!.signIn!({
        account: { provider: 'cognito' },
        profile: { email },
      } as never);
    }

    const [first, second] = warnSpy.mock.calls.map((call) => captured(call as unknown[]));
    expect(first).not.toBe(second);
  });

  it('keeps the database-error path free of the address too', async () => {
    findUnique.mockRejectedValue(new Error('connection reset'));

    const result = await authConfig.callbacks!.signIn!({
      account: { provider: 'cognito' },
      profile: { email: THERAPIST_EMAIL },
    } as never);

    expect(result).toBe('/auth?error=server_error');
    const everything = [
      ...logSpy.mock.calls,
      ...warnSpy.mock.calls,
    ].map((call) => captured(call as unknown[]));
    expect(everything.join('\n')).not.toMatch(EMAIL_SHAPED);
  });
});

describe('identityRef', () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = 'test-secret-for-log-refs';
  });

  afterEach(() => {
    delete process.env.NEXTAUTH_SECRET;
  });

  it('is a truncated, prefixed digest rather than the value', () => {
    const ref = identityRef('u', THERAPIST_EMAIL);
    expect(ref).toMatch(/^u_[0-9a-f]{12}$/);
    expect(ref).not.toContain('ananya');
  });

  it('is deterministic for the same value and differs across values and kinds', () => {
    expect(identityRef('t', THERAPIST_ID)).toBe(identityRef('t', THERAPIST_ID));
    expect(identityRef('t', THERAPIST_ID)).not.toBe(identityRef('t', 'another-id'));
    expect(identityRef('t', THERAPIST_ID)).not.toBe(identityRef('u', THERAPIST_ID));
  });

  it('normalises case and surrounding whitespace', () => {
    expect(identityRef('u', '  Ananya.Rao@OKUVU.in ')).toBe(
      identityRef('u', THERAPIST_EMAIL),
    );
  });
});

describe('redactEmails', () => {
  it('replaces every address inside a provider payload', () => {
    const payload = JSON.stringify({
      message: `recipient ${THERAPIST_EMAIL} rejected`,
      cc: ['someone@example.com'],
    });
    const safe = redactEmails(payload);
    expect(safe).not.toMatch(EMAIL_SHAPED);
    expect(safe).toContain('c_');
  });

  it('leaves address-free text untouched', () => {
    expect(redactEmails('status 500, no recipient')).toBe('status 500, no recipient');
  });
});

describe('invite mailer logs a reference, not the recipient', () => {
  it('writes toRef instead of the address when no API key is configured', async () => {
    const saved = process.env.BREVO_API_KEY;
    delete process.env.BREVO_API_KEY;
    process.env.NEXTAUTH_SECRET = 'test-secret-for-log-refs';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const result = await sendInviteEmail({
        to: 'client.person@example.com',
        therapistName: 'Dr. Ananya Rao',
        clientName: null,
        inviteCode: 'ABCD1234',
      });

      expect(result.sent).toBe(false);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const line = captured(warnSpy.mock.calls[0] as unknown[]);
      expect(line).not.toMatch(EMAIL_SHAPED);
      expect(line).not.toContain('client.person');
      expect(line).toMatch(/"toRef":"c_[0-9a-f]{12}"/);
      expect(line).toContain('ABCD1234');
    } finally {
      warnSpy.mockRestore();
      delete process.env.NEXTAUTH_SECRET;
      if (saved !== undefined) process.env.BREVO_API_KEY = saved;
    }
  });
});
