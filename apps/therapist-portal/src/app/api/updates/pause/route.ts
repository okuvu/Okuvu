import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * The pause page an updates email links to.
 *
 * Public on purpose: the whole point is that a client can stop the mail from a
 * mailbox, without an account, a session or an app install. The token is a
 * random per-client string, not a derived one, and it grants exactly one thing —
 * turning `update_emails_enabled` off. It unlocks no data, so a bare token in a
 * query string is the right trade here.
 *
 * Deliberately tells the visitor nothing about themselves: no name, no address,
 * no therapist, no counts. A pause URL can be forwarded, and a page that
 * confirmed "we've stopped emails to priya@…" would leak the very thing the mail
 * is careful not to say.
 *
 * The Updates list inside the app is unaffected. Pausing email never hides an
 * update; it only stops the message that points at it.
 */

const PAGE_HEAD =
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<title>OKUVU</title></head>' +
  '<body style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; ' +
  'background: #F7F4EE; color: #1F1B24; margin: 0; padding: 48px 20px;">' +
  '<main style="max-width: 420px; margin: 0 auto;">' +
  '<h1 style="font-size: 20px; font-weight: 600; margin: 0 0 16px;">OKUVU</h1>';

const PAGE_FOOT =
  '<p style="font-size: 13px; color: #6B6B6B; margin-top: 24px;">' +
  'OKUVU is not an emergency service. If you are in danger now, call 112.' +
  '</p></main></body></html>';

function page(bodyHtml: string, status = 200): Response {
  return new Response(`${PAGE_HEAD}${bodyHtml}${PAGE_FOOT}`, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  const token = request.nextUrl.searchParams.get('t');

  if (!token || token.length < 8) {
    return page(
      '<p style="line-height: 1.5;">This link is not complete. Open the OKUVU app, go to Settings, then Notifications, and switch email updates off there.</p>',
      400,
    );
  }

  const db = prisma;
  if (!db) {
    console.error('[updates/pause] no database configured — pause link not actioned');
    return page(
      '<p style="line-height: 1.5;">Something went wrong. Open the OKUVU app, go to Settings, then Notifications, and switch email updates off there.</p>',
      503,
    );
  }

  try {
    const user = await db.user.findUnique({
      where: { email_update_token: token },
      select: { id: true, update_emails_enabled: true },
    });

    if (!user) {
      return page(
        '<p style="line-height: 1.5;">We could not find this link. Open the OKUVU app, go to Settings, then Notifications, and switch email updates off there.</p>',
        404,
      );
    }

    if (user.update_emails_enabled) {
      await db.user.update({
        where: { id: user.id },
        data: { update_emails_enabled: false },
      });
    }

    return page(
      '<p style="line-height: 1.5;">Done. You will not get these emails any more.</p>' +
        '<p style="line-height: 1.5;">Anything your therapist sends you still appears in the OKUVU app, in Updates. You can turn these emails back on in Settings, under Notifications.</p>',
    );
  } catch (err) {
    console.error('[updates/pause] could not action the pause link', err);
    return page(
      '<p style="line-height: 1.5;">Something went wrong. Open the OKUVU app, go to Settings, then Notifications, and switch email updates off there.</p>',
      500,
    );
  }
}
