import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The landing page's only public write.
 *
 * These tests pin the behaviours that are not obvious from reading the form:
 * the honeypot is silent, a duplicate looks identical to a first-time
 * submission (so the endpoint cannot be used to test whether an address is
 * already on a list that reveals someone is seeking support), and consent is
 * enforced server-side rather than only in the UI.
 *
 * Copy revision v1 (§13) added a second form. The extra cases below cover what
 * that split makes possible and must not quietly allow: a therapist row with no
 * name, a `kind` nobody defined, and a client posting therapist fields (or the
 * reverse) into the wrong kind of row.
 */

const findFirst = vi.fn();
const create = vi.fn();
const sendWaitlistNotification = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: { waitlistEntry: { findFirst, create } },
}));

// The operator notification is the other half of "the enquiry reached a human".
// Mocked here so the suite never reaches Brevo, but still asserted: a route that
// quietly stopped telling admin@okuvu.in would otherwise pass every test.
vi.mock('@/lib/email', () => ({ sendWaitlistNotification }));

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

/** The shape a client submission stores, with every field spelled out. */
function clientRow(email: string, over: Record<string, unknown> = {}) {
  return {
    data: {
      email,
      kind: 'client',
      name: null,
      organisation: null,
      caseload: null,
      has_therapist: null,
      ...over,
    },
  };
}

describe('POST /api/waitlist', () => {
  beforeEach(() => {
    findFirst.mockReset();
    create.mockReset();
    sendWaitlistNotification.mockReset();
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ id: 'w_1' });
    sendWaitlistNotification.mockResolvedValue({ sent: true });
  });

  it('stores a new address and returns ok', async () => {
    const res = await POST(post({ email: 'Person@Example.com ', consent: true }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(create).toHaveBeenCalledWith(clientRow('person@example.com'));
    // The duplicate check is per kind, or a therapist enquiry would be
    // swallowed by an older client row from the same address.
    expect(findFirst).toHaveBeenCalledWith({ where: { email: 'person@example.com', kind: 'client' } });
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
    // Both honeypot names: `website` is the current one, `company` the
    // pre-revision one, still honoured so a stale bundle is not a bypass.
    for (const honeypot of [{ website: 'acme.test' }, { company: 'Acme' }]) {
      const res = await POST(post({ email: 'bot@example.com', consent: true, ...honeypot }));

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ ok: true });
    }
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

  it('tells the operator inbox about a new address, flagged as new', async () => {
    await POST(post({ email: 'Person@Example.com ', consent: true }));

    expect(sendWaitlistNotification).toHaveBeenCalledWith({
      email: 'person@example.com',
      repeat: false,
      kind: 'client',
      name: null,
      organisation: null,
      caseload: null,
      hasTherapist: null,
    });
  });

  it('still tells the operator when the address was already listed, flagged as a repeat', async () => {
    findFirst.mockResolvedValue({ id: 'w_existing' });
    create.mockRejectedValue(new Error('must not be called'));

    const res = await POST(post({ email: 'person@example.com', consent: true }));

    expect(res.status).toBe(200);
    expect(sendWaitlistNotification).toHaveBeenCalledWith({
      email: 'person@example.com',
      repeat: true,
      kind: 'client',
      name: null,
      organisation: null,
      caseload: null,
      hasTherapist: null,
    });
  });

  it('never notifies the operator about a refusal', async () => {
    await POST(post({ email: 'nope', consent: true }));
    await POST(post({ email: 'person@example.com', consent: false }));
    await POST(post({ email: 'bot@example.com', consent: true, website: 'acme.test' }));
    await POST(post({ email: 'therapist@example.com', consent: true, kind: 'therapist' }));

    expect(sendWaitlistNotification).not.toHaveBeenCalled();
  });

  it('does not leak a database failure as a stack trace', async () => {
    create.mockRejectedValue(new Error('connection reset by peer'));
    sendWaitlistNotification.mockResolvedValue({ sent: false });

    const res = await POST(post({ email: 'person@example.com', consent: true }));

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: 'unavailable' });
  });

  it('accepts the enquiry when the database fails but the operator was told', async () => {
    // The person at the form is on a list either way — one in Postgres, one in
    // the operator's inbox. Answering 503 here would ask them to retry a request
    // that already reached a human.
    create.mockRejectedValue(new Error('connection reset by peer'));
    sendWaitlistNotification.mockResolvedValue({ sent: true });

    const res = await POST(post({ email: 'person@example.com', consent: true }));

    expect(res.status).toBe(200);
    expect(sendWaitlistNotification).toHaveBeenCalledWith({
      email: 'person@example.com',
      repeat: false,
      kind: 'client',
      name: null,
      organisation: null,
      caseload: null,
      hasTherapist: null,
    });
  });

  // ── the therapist form (§13) ─────────────────────────────────────────

  it('stores a therapist enquiry with the answers the client form does not ask for', async () => {
    const res = await POST(
      post({
        kind: 'therapist',
        email: 'Therapist@Example.com',
        consent: true,
        name: '  A Therapist ',
        organisation: 'Quiet Practice',
        caseload: '12',
        // A therapist form has no such question; if one is posted anyway it
        // must not be stored.
        has_therapist: true,
      }),
    );

    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledWith({
      data: {
        email: 'therapist@example.com',
        kind: 'therapist',
        name: 'A Therapist',
        organisation: 'Quiet Practice',
        caseload: '12',
        has_therapist: null,
      },
    });
    expect(sendWaitlistNotification).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'therapist', name: 'A Therapist', caseload: '12' }),
    );
  });

  it('refuses a therapist enquiry with no name, whatever the UI sends', async () => {
    for (const name of [undefined, '', '   ']) {
      const res = await POST(post({ kind: 'therapist', email: 'therapist@example.com', consent: true, name }));
      expect(res.status, String(name)).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'name_required' });
    }
    expect(create).not.toHaveBeenCalled();
  });

  it('treats an unknown kind as a client rather than trusting the string', async () => {
    const res = await POST(post({ kind: 'admin', email: 'person@example.com', consent: true }));

    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledWith(clientRow('person@example.com'));
  });

  it('records the client answer about having a therapist, and only for clients', async () => {
    await POST(post({ email: 'person@example.com', consent: true, has_therapist: true }));

    expect(create).toHaveBeenCalledWith(clientRow('person@example.com', { has_therapist: true }));
  });

  it('keeps a therapist enquiry separate from a client row for the same address', async () => {
    // A person can legitimately be both: already in therapy, and a therapist.
    await POST(post({ email: 'person@example.com', consent: true }));
    await POST(post({ kind: 'therapist', email: 'person@example.com', consent: true, name: 'A Therapist' }));

    expect(findFirst).toHaveBeenNthCalledWith(1, {
      where: { email: 'person@example.com', kind: 'client' },
    });
    expect(findFirst).toHaveBeenNthCalledWith(2, {
      where: { email: 'person@example.com', kind: 'therapist' },
    });
    expect(create).toHaveBeenCalledTimes(2);
  });
});
