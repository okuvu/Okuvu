/**
 * Therapist-portal wireframes, Phase 3 — Brevo transactional email for
 * the Add-Client wizard's invite. Mirrors apps/api/src/lib/email.ts —
 * duplicated rather than imported cross-package, since apps/api and
 * apps/therapist-portal are independently-deployed services that only
 * share the database, not code execution.
 *
 * Without BREVO_API_KEY set, this logs instead of sending — a safe no-op
 * for local dev/CI, not an error. The invite code is always shown
 * on-screen too (for manual SMS/WhatsApp share), so a missing API key
 * doesn't block onboarding a client end-to-end.
 */

import { identityRef, redactEmails } from '@/lib/log-identity';

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';

export interface SendInviteEmailParams {
  to: string;
  therapistName: string;
  clientName: string | null;
  inviteCode: string;
}

export async function sendInviteEmail(params: SendInviteEmailParams): Promise<{ sent: boolean }> {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM_EMAIL || 'noreply@okuvu.in';
  const fromName = process.env.BREVO_FROM_NAME || 'OKUVU';

  const greeting = params.clientName ? `Hi ${params.clientName},` : 'Hi,';
  const htmlContent = `
    <p>${greeting}</p>
    <p>${params.therapistName} has invited you to OKUVU. Open the OKUVU app, tap "Have an invite code?", and enter:</p>
    <p style="font-size: 20px; font-weight: bold; letter-spacing: 2px;">${params.inviteCode}</p>
    <p>This code expires in 7 days.</p>
  `;

  if (!apiKey) {
    // E16-S11: the recipient address is personal data; log the send attempt
    // against a stable reference instead of the address itself. The invite code
    // is not personal data and stays — it is how a local send is completed.
    console.warn('[email] BREVO_API_KEY not set — skipping send, invite code logged only', {
      toRef: identityRef('c', params.to),
      inviteCode: params.inviteCode,
    });
    return { sent: false };
  }

  try {
    const response = await fetch(BREVO_SEND_URL, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: fromEmail, name: fromName },
        to: [{ email: params.to, name: params.clientName ?? undefined }],
        subject: `${params.therapistName} has invited you to OKUVU`,
        htmlContent,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error('[email] Brevo send failed', {
        status: response.status,
        body: redactEmails(body).slice(0, 500),
      });
      return { sent: false };
    }

    return { sent: true };
  } catch (err) {
    console.error('[email] Brevo send threw', err);
    return { sent: false };
  }
}

/**
 * Where an enquiry about Okuvu goes: the operator inbox, not a database table
 * nobody opens.
 *
 * The waitlist route stores the address first and calls this second, so a
 * missing or expired API key costs a *notification*, never a lead — but it does
 * mean "it returned ok" and "somebody was told" are two different facts, which
 * is why the send result is logged.
 *
 * Reply-To is the visitor: hitting reply answers them directly instead of
 * asking the operator to copy an address out of the body.
 */
export interface SendWaitlistNotificationParams {
  email: string;
  /** true when the address was already on the list — the operator sees repeats. */
  repeat: boolean;
  /**
   * Copy revision v1 §13: a therapist enquiry carries the answers the client
   * form does not ask for. They go in the operator email so the reply can be
   * useful even if the row is never opened — and they are HTML-escaped, since
   * these are free-text strings typed by a stranger.
   */
  kind?: 'client' | 'therapist';
  name?: string | null;
  organisation?: string | null;
  caseload?: string | null;
  hasTherapist?: boolean | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendWaitlistNotification(
  params: SendWaitlistNotificationParams,
): Promise<{ sent: boolean }> {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM_EMAIL || 'noreply@okuvu.in';
  const fromName = process.env.BREVO_FROM_NAME || 'OKUVU';
  // One place to change the address, and the same one the page tells people to
  // write to. Variables, not a constant, because the beta and production
  // operator inboxes are not necessarily the same mailbox.
  const toEmail = process.env.WAITLIST_NOTIFY_EMAIL || 'admin@okuvu.in';

  const therapist = params.kind === 'therapist';
  const label = therapist
    ? params.repeat
      ? 'Therapist enquiry — already listed'
      : 'Therapist enquiry — walkthrough requested'
    : params.repeat
      ? 'Waitlist — already listed'
      : 'Waitlist — new place requested';

  const detail = therapist
    ? `
    <p><strong>Name:</strong> ${escapeHtml(params.name ?? '—')}</p>
    <p><strong>Practice:</strong> ${escapeHtml(params.organisation || '—')}</p>
    <p><strong>Caseload:</strong> ${escapeHtml(params.caseload || '—')}</p>
  `
    : params.hasTherapist === undefined || params.hasTherapist === null
      ? ''
      : `<p><strong>Already has a therapist:</strong> ${params.hasTherapist ? 'yes' : 'no'}</p>`;

  const htmlContent = `
    <p><strong>${label}</strong></p>
    <p style="font-size:18px">${escapeHtml(params.email)}</p>
    ${detail}
    <p>${params.repeat ? 'This address was already on the list; the person asked again.' : 'New entry on the list.'}</p>
    <p>Reply to this email to answer them directly.</p>
  `;

  if (!apiKey) {
    console.warn('[email] BREVO_API_KEY not set — waitlist entry stored, operator not notified', {
      toRef: identityRef('c', params.email),
      toEmail,
    });
    return { sent: false };
  }

  try {
    const response = await fetch(BREVO_SEND_URL, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: fromEmail, name: fromName },
        to: [{ email: toEmail }],
        replyTo: { email: params.email },
        subject: `${label}: ${params.email}`,
        htmlContent,
        // The notification is an internal message about a person, not marketing.
        tags: ['waitlist-notify'],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error('[email] Brevo waitlist notification failed', {
        status: response.status,
        body: redactEmails(body).slice(0, 500),
      });
      return { sent: false };
    }

    return { sent: true };
  } catch (err) {
    console.error('[email] Brevo waitlist notification threw', err);
    return { sent: false };
  }
}
