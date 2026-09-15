import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sendInviteEmail } from '../lib/email.js';

const ORIGINAL_ENV = { ...process.env };

describe('sendInviteEmail (therapist-portal wireframes C-06 — Brevo)', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('no-ops (does not send) when BREVO_API_KEY is unset', async () => {
    delete process.env.BREVO_API_KEY;
    const fetchSpy = vi.spyOn(global, 'fetch');

    const result = await sendInviteEmail({
      to: 'client@example.com',
      therapistName: 'Dr. Jane',
      clientName: 'Shubhangi',
      inviteCode: 'AB12CD34',
    });

    expect(result).toEqual({ sent: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('POSTs to Brevo with the api-key header when BREVO_API_KEY is set', async () => {
    process.env.BREVO_API_KEY = 'test-key';
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ messageId: 'abc' }), { status: 201 }),
    );

    const result = await sendInviteEmail({
      to: 'client@example.com',
      therapistName: 'Dr. Jane',
      clientName: 'Shubhangi',
      inviteCode: 'AB12CD34',
    });

    expect(result).toEqual({ sent: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.brevo.com/v3/smtp/email',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'api-key': 'test-key' }),
      }),
    );
  });

  it('returns sent:false when Brevo responds with an error status', async () => {
    process.env.BREVO_API_KEY = 'test-key';
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('bad request', { status: 400 }));

    const result = await sendInviteEmail({
      to: 'client@example.com',
      therapistName: 'Dr. Jane',
      clientName: null,
      inviteCode: 'AB12CD34',
    });

    expect(result).toEqual({ sent: false });
  });

  it('returns sent:false when the fetch call throws', async () => {
    process.env.BREVO_API_KEY = 'test-key';
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));

    const result = await sendInviteEmail({
      to: 'client@example.com',
      therapistName: 'Dr. Jane',
      clientName: null,
      inviteCode: 'AB12CD34',
    });

    expect(result).toEqual({ sent: false });
  });
});
