/**
 * The safety alert email — the one sender in lib/email.ts that must NOT be a
 * silent no-op when unconfigured.
 *
 * Every other sender (invite, waitlist) warns and moves on, because the row it
 * reports on is already stored. Here the therapist believes the inbox IS the
 * alert channel, so a missing API key in production has to be audible.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { sendSafetyAlertEmail, formatAlertTimestamp } from '../lib/email.js';

const ORIGINAL_ENV = { ...process.env };

function params() {
  return {
    to: 'therapist@example.test',
    therapistName: 'Dr Rao',
    clientLabel: 'A. (Tuesdays)',
    level: 'S4' as const,
    occurredAt: new Date('2026-11-02T10:30:00Z'),
    link: 'https://okuvu.in/clients/user_1#safety',
  };
}

describe('sendSafetyAlertEmail', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('throws in production when BREVO_API_KEY is unset, rather than doing nothing', async () => {
    delete process.env.BREVO_API_KEY;
    process.env.NODE_ENV = 'production';

    await expect(sendSafetyAlertEmail(params())).rejects.toThrow(/BREVO_API_KEY is not set/);
  });

  it('logs an error and returns in development when the key is missing', async () => {
    delete process.env.BREVO_API_KEY;
    process.env.NODE_ENV = 'test';
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendSafetyAlertEmail(params())).resolves.toEqual({ sent: true });
    expect(error).toHaveBeenCalled();
  });

  it('sends the label, the level, the time and the link — nothing else', async () => {
    process.env.BREVO_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);

    await sendSafetyAlertEmail(params());

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.to).toEqual([{ email: 'therapist@example.test', name: 'Dr Rao' }]);
    expect(body.subject).toContain('S4');
    expect(body.subject).toContain('A. (Tuesdays)');
    expect(body.htmlContent).toContain('A. (Tuesdays)');
    expect(body.htmlContent).toContain('https://okuvu.in/clients/user_1#safety');
    // The standing disclaimer, because an alert in an inbox is not a monitor.
    expect(body.htmlContent).toContain('not monitored 24/7');
  });

  it('throws when Brevo refuses the send', async () => {
    process.env.BREVO_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorised' }),
    );

    await expect(sendSafetyAlertEmail(params())).rejects.toThrow(/safety alert send failed/);
  });
});

describe('formatAlertTimestamp', () => {
  it('renders an India-local time with the zone named', () => {
    // 10:30 UTC is 4:00 pm IST.
    expect(formatAlertTimestamp(new Date('2026-11-02T10:30:00Z'))).toContain('4:00');
    expect(formatAlertTimestamp(new Date('2026-11-02T10:30:00Z'))).toContain('IST');
  });
});
