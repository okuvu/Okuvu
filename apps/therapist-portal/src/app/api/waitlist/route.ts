import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/server/rate-limit';

/**
 * Public waitlist intake for the landing page.
 *
 * This is the one write an anonymous visitor can perform, so it is written to
 * behave the same whether or not something interesting is happening:
 *
 *   - a duplicate address returns the same 200 as a new one, because the
 *     response must not become a way to test whether someone is on a list
 *     that reveals they are looking for mental-health support;
 *   - a filled honeypot returns 200 and stores nothing;
 *   - failures store nothing and say nothing about why, beyond "try again".
 *
 * It is exempted from the session redirect in `proxy.ts` (listed there with
 * the other public paths) — otherwise every submission would 307 to /auth.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Body = {
  email?: unknown;
  /** Bots fill every field they find. Real people never see this one. */
  company?: unknown;
  consent?: unknown;
};

function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

export async function POST(request: Request) {
  if (!checkRateLimit(`waitlist:${clientKey(request)}`, 5, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  // Honeypot: success to the bot, nothing to us.
  if (typeof body.company === 'string' && body.company.trim() !== '') {
    return NextResponse.json({ ok: true });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }
  if (body.consent !== true) {
    return NextResponse.json({ error: 'consent_required' }, { status: 400 });
  }
  if (!prisma) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  try {
    const existing = await prisma.waitlistEntry.findFirst({ where: { email } });
    if (!existing) {
      await prisma.waitlistEntry.create({ data: { email } });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[WAITLIST] failed to store entry', error);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
