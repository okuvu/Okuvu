import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The pause page a client reaches from the footer of an updates email.
 *
 * It is public and it acts on a bare token, so two things matter more than the
 * wording: it can only ever clear one boolean, and it tells the visitor nothing
 * about themselves. A pause URL gets forwarded, screenshotted and read over a
 * shoulder like any other link in a mailbox.
 */

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

const { GET } = await import('@/app/api/updates/pause/route');

async function mockDb() {
  const { prisma } = await import('@/lib/prisma');
  return prisma as unknown as {
    user: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  };
}

function request(query: string) {
  return new NextRequest(`https://portal.okuvu.in/api/updates/pause${query}`);
}

beforeEach(async () => {
  const db = await mockDb();
  db.user.findUnique.mockReset();
  db.user.update.mockReset();
  db.user.update.mockResolvedValue({});
});

describe('GET /api/updates/pause', () => {
  it('turns email updates off for the token holder', async () => {
    const db = await mockDb();
    db.user.findUnique.mockResolvedValue({ id: 'usr_1', update_emails_enabled: true });

    const res = await GET(request('?t=abcdef12-3456-7890-abcd-ef1234567890'));
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'usr_1' },
      // One column, nothing else: the link's whole power.
      data: { update_emails_enabled: false },
    });
    expect(html).toContain('You will not get these emails any more.');
    expect(html).toContain('still appears in the OKUVU app');
  });

  it('is idempotent — a second visit does not write again', async () => {
    const db = await mockDb();
    db.user.findUnique.mockResolvedValue({ id: 'usr_1', update_emails_enabled: false });

    const res = await GET(request('?t=abcdef12-3456-7890-abcd-ef1234567890'));

    expect(res.status).toBe(200);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('answers 404 for a token that belongs to nobody, and changes nothing', async () => {
    const db = await mockDb();
    db.user.findUnique.mockResolvedValue(null);

    const res = await GET(request('?t=not-a-real-token'));

    expect(res.status).toBe(404);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('answers 400 when the link arrived without its token', async () => {
    const db = await mockDb();

    const res = await GET(request(''));

    expect(res.status).toBe(400);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('names nobody: no address, no name, no therapist in the page', async () => {
    const db = await mockDb();
    db.user.findUnique.mockResolvedValue({ id: 'usr_1', update_emails_enabled: true });

    const html = await GET(request('?t=abcdef12-3456-7890-abcd-ef1234567890'));

    const body = await html.text();
    expect(body.toLowerCase()).not.toContain('@');
    expect(body).not.toContain('usr_1');
    // "your therapist" as a role is fine; a therapist's name would not be.
    expect(body.toLowerCase()).not.toContain('dr.');
  });
});
