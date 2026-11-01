import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendWaitlistNotification } from '@/lib/email';
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
 * Copy revision v1 (§13) split the form in two. The body now carries `kind`,
 * and a therapist enquiry also carries a name, a practice and a rough caseload.
 * Everything the browser sends is re-validated here: the client form is a
 * courtesy, not a gate, and a crafted request must not be able to store a
 * therapist row with no name, or a `kind` nobody defined.
 *
 * It is exempted from the session redirect in `proxy.ts` (listed there with
 * the other public paths) — otherwise every submission would 307 to /auth.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const KINDS = ['client', 'therapist'] as const;
type Kind = (typeof KINDS)[number];

type Body = {
  kind?: unknown;
  email?: unknown;
  /** Bots fill every field they find. Real people never see this one. */
  website?: unknown;
  /** The pre-revision honeypot name, still honoured so a stale bundle is not a bypass. */
  company?: unknown;
  consent?: unknown;
  name?: unknown;
  organisation?: unknown;
  caseload?: unknown;
  has_therapist?: unknown;
};

/** Free text, trimmed and bounded — these end up in an email to a person. */
function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

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
  const honeypot = [body.website, body.company].find(
    (value) => typeof value === 'string' && value.trim() !== '',
  );
  if (honeypot !== undefined) {
    return NextResponse.json({ ok: true });
  }

  const kind: Kind = KINDS.includes(body.kind as Kind) ? (body.kind as Kind) : 'client';

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }
  if (body.consent !== true) {
    return NextResponse.json({ error: 'consent_required' }, { status: 400 });
  }

  const name = kind === 'therapist' ? text(body.name, 120) : null;
  if (kind === 'therapist' && !name) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }
  const organisation = kind === 'therapist' ? text(body.organisation, 160) : null;
  const caseload = kind === 'therapist' ? text(body.caseload, 40) : null;
  const hasTherapist =
    kind === 'client' && typeof body.has_therapist === 'boolean' ? body.has_therapist : null;

  // Store it, then tell a person. Both halves end at admin@okuvu.in, because a
  // row nobody reads and a lost lead look identical to whoever filled the form.
  // A missing DATABASE_URL (prisma === null) therefore skips only the store:
  // the enquiry still reaches the operator inbox, and only both failing is a 503.
  let stored = false;
  let repeat = false;

  if (prisma) {
    try {
      // A therapist asking for a walkthrough is a different entry from the same
      // address asking for a place, so the duplicate check is per kind.
      const existing = await prisma.waitlistEntry.findFirst({ where: { email, kind } });
      repeat = Boolean(existing);
      if (!existing) {
        await prisma.waitlistEntry.create({
          data: {
            email,
            kind,
            name,
            organisation,
            caseload,
            has_therapist: hasTherapist,
          },
        });
      }
      stored = true;
    } catch (error) {
      console.error('[WAITLIST] failed to store entry', error);
    }
  }

  // Awaited rather than fired and forgotten: an unawaited promise can be
  // dropped once the response is sent. It never throws, so it cannot fail the
  // request — the person in front of the form has done their part.
  const notified = await sendWaitlistNotification({
    email,
    repeat,
    kind,
    name,
    organisation,
    caseload,
    hasTherapist,
  });

  if (stored || notified.sent) {
    if (!notified.sent) {
      console.warn('[WAITLIST] stored but operator not notified', { repeat, kind });
    }
    return NextResponse.json({ ok: true });
  }

  console.error('[WAITLIST] neither stored nor notified');
  return NextResponse.json({ error: 'unavailable' }, { status: 503 });
}
