import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The landing page's only public write.
 *
 * These tests pin the three behaviours that are not obvious from reading the
 * form: the honeypot is silent, a duplicate looks identical to a first-time
 * submission (so the endpoint cannot be used to test whether an address is
 * already on a list that reveals someone is seeking support), and consent is
 * enforced server-side rather than only in the UI.
 */

const findFirst = vi.fn();
const create = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: { waitlistEntry: { findFirst, create } },
}));

const { POST } = await import('@/app/api/waitlist/route');

let ipCounter = 0;

function post(body: unknown, ip?: string): Request {
  // Each request gets its own bucket unless a test wants to share one, so the
  // in-memory rate limiter cannot make unrelated assertions flaky.
  const forwarded = ip ?? `10.0.0.${++ipCounter}`;
  return new Request('https://www.okuvu.in/api/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': forwarded },
    body: JSON.stringify(body),
  });
}

describe('POST /api/waitlist', () => {
  beforeEach(() => {
    findFirst.mockReset();
    create.mockReset();
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ id: 'w_1' });
  });

  it('stores a new address and returns ok', async () => {
    const res = await POST(post({ email: 'Person@Example.com ', consent: true }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(create).toHaveBeenCalledWith({ data: { email: 'person@example.com' } });
  });

  it('returns the same ok for a duplicate without creating a second row', async () => {
    findFirst.mockResolvedValue({ id: 'w_existing' });

    const res = await POST(post({ email: 'person@example.com', consent: true }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a malformed email', async () => {
    for (const email of ['nope', 'a@b', '', 'x@y.', 'a b@example.com']) {
      const res = await POST(post({ email, consent: true }));
      expect(res.status, email).toBe(400);
    }
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses submissions without consent, whatever the UI sends', async () => {
    const res = await POST(post({ email: 'person@example.com', consent: false }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'consent_required' });
    expect(create).not.toHaveBeenCalled();
  });

  it('answers a filled honeypot with success and stores nothing', async () => {
    const res = await POST(post({ email: 'bot@example.com', consent: true, company: 'Acme' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(create).not.toHaveBeenCalled();
  });

  it('rate limits a single address after five attempts in a minute', async () => {
    const ip = '10.9.9.9';
    for (let i = 0; i < 5; i += 1) {
      const res = await POST(post({ email: `person${i}@example.com`, consent: true }, ip));
      expect(res.status).toBe(200);
    }

    const blocked = await POST(post({ email: 'person6@example.com', consent: true }, ip));
    expect(blocked.status).toBe(429);
    await expect(blocked.json()).resolves.toEqual({ error: 'rate_limited' });
  });

  it('does not leak a database failure as a stack trace', async () => {
    create.mockRejectedValue(new Error('connection reset by peer'));

    const res = await POST(post({ email: 'person@example.com', consent: true }));

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: 'unavailable' });
  });
});
