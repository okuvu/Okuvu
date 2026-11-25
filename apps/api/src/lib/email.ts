/**
 * Therapist-portal wireframes, Phase 3 — Brevo transactional email for
 * the Add-Client wizard's invite. Plain fetch to Brevo's REST API rather
 * than pulling in an SDK — this is a single POST call, matching this
 * codebase's lean-dependency style (see e.g. quote-of-day.ts).
 *
 * Without BREVO_API_KEY set, this logs instead of sending — a safe no-op
 * for local dev/CI, not an error. The Add-Client wizard's invite code is
 * always shown on-screen too (for manual SMS/WhatsApp share), so a
 * missing API key doesn't block onboarding a client end-to-end.
 *
 * There's no web landing page for the invite — redemption happens inside
 * the mobile app itself (a short "enter invite code" screen), so this
 * emails a plain code, not a clickable link.
 */

import { identityRef, redactEmails } from './log-identity.js';
import {
  WORRY_REMINDER_COPY_APPROVED,
  WORRY_REMINDER_EMAIL,
} from '@okuvu/shared-types/worksheets/anxiety-worry';

/** Minimal HTML escape for the two interpolated strings in the reminder. */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

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
    // E16-S11: the recipient address is personal data — log a stable reference.
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
 * Worry time — the daily reminder (owner's brief, 24 Nov 2026).
 *
 * The wording is NOT approved yet, so this function sends nothing until
 * `WORRY_REMINDER_COPY_APPROVED` is true. That is a fail-closed switch rather
 * than a comment: the owner approves every client-facing string, and a reminder
 * is a string that arrives on a phone by itself.
 *
 * The copy lives in the catalogue (one home, next to the rest of the approved
 * content) and is deliberately dull. The owner's constraint is that the subject
 * and the preview must not mention worry, anxiety or mental health, because a
 * family member may see the notification on a shared phone; the body never
 * quotes, summarises or counts what the client wrote. "You parked 2 worries" is
 * a count of their own writing on a lock screen, which is not the same thing as
 * a reminder.
 *
 * Same fail-open shape as the invite: no BREVO_API_KEY logs and returns
 * `{ sent: false }`, so a missing key never breaks the sweep.
 */
export interface SendWorryTimeEmailParams {
  to: string;
  name: string | null;
  minutes: number;
  parkedCount: number;
}

export async function sendWorryTimeEmail(
  params: SendWorryTimeEmailParams,
): Promise<{ sent: boolean }> {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM_EMAIL || 'noreply@okuvu.in';
  const fromName = process.env.BREVO_FROM_NAME || 'OKUVU';

  // Fail closed: no approved wording, no email.
  if (!WORRY_REMINDER_COPY_APPROVED) {
    console.info('[email] worry-time reminder is waiting on the owner’s approval; nothing sent', {
      toRef: identityRef('c', params.to),
    });
    return { sent: false };
  }

  const greeting = params.name ? `Hi ${params.name},` : 'Hello,';
  // One paragraph per line of the approved body, with the greeting in place of
  // the neutral opener. Nothing about the client's own list appears here.
  const bodyLines = WORRY_REMINDER_EMAIL.body.split('\n').filter((line) => line.trim().length > 0);
  const paragraphs = bodyLines.slice(1).map((line) => `<p>${escapeHtml(line)}</p>`).join('\n');
  const htmlContent = `
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(
      WORRY_REMINDER_EMAIL.preview,
    )}</div>
    <p>${escapeHtml(greeting)}</p>
    ${paragraphs}
  `;

  if (!apiKey) {
    console.warn('[email] BREVO_API_KEY not set — skipping send for worry-time reminder', {
      toRef: identityRef('c', params.to),
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
        to: [{ email: params.to, name: params.name ?? undefined }],
        subject: WORRY_REMINDER_EMAIL.subject,
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
 * S6 (waitlist) — confirmation sent after a phone number with no
 * invite/account joins the waitlist. Same fail-open shape as
 * sendInviteEmail: a missing key or send failure never blocks the
 * capture itself, since the row in WaitlistEntry is already saved.
 */
export interface SendWaitlistConfirmationEmailParams {
  to: string;
}

export async function sendWaitlistConfirmationEmail(
  params: SendWaitlistConfirmationEmailParams,
): Promise<{ sent: boolean }> {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM_EMAIL || 'noreply@okuvu.in';
  const fromName = process.env.BREVO_FROM_NAME || 'OKUVU';

  const htmlContent = `
    <p>Hi,</p>
    <p>Thanks for your interest in OKUVU. We don't have an account for your phone number yet — we'll be in touch as soon as one is ready.</p>
  `;

  if (!apiKey) {
    console.warn('[email] BREVO_API_KEY not set — skipping waitlist confirmation send', {
      toRef: identityRef('c', params.to),
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
        to: [{ email: params.to }],
        subject: "You're on the OKUVU waitlist",
        htmlContent,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error('[email] Brevo waitlist confirmation send failed', {
        status: response.status,
        body: redactEmails(body).slice(0, 500),
      });
      return { sent: false };
    }

    return { sent: true };
  } catch (err) {
    console.error('[email] Brevo waitlist confirmation send threw', err);
    return { sent: false };
  }
}

/**
 * Safety alert — "a client you support had a crisis event".
 *
 * Unlike every other sender in this file, a missing BREVO_API_KEY in
 * production is an ERROR, not a no-op: a safety alert that silently does
 * nothing is the worst possible failure mode, because the therapist believes
 * the inbox is the alert channel. The flag row in SafetyFlag is still the
 * durable record; this function's job is to make the silence audible.
 *
 * What it may carry, and nothing else: the therapist's own label for the
 * client, the level, the time, and a link into the portal. No message text,
 * no summary, no clinical reasoning — email leaves the building and the
 * inbox is less protected than the portal.
 */
export interface SendSafetyAlertEmailParams {
  to: string;
  therapistName: string | null;
  clientLabel: string;
  level: 'S3' | 'S4';
  occurredAt: Date;
  link: string;
  /**
   * The alert is urgent (owner's approval, 24 Nov 2026). It leads the subject
   * line and adds one line to the body. The email still carries no message text
   * — the words are read in the portal, which is the protected surface.
   */
  urgent?: boolean;
  /**
   * Which surface the flag came from, as a phrase that reads inside a sentence:
   * "a chat message", "a worksheet answer", "a journal entry", "a mood
   * check-in". The urgent line used to say "a worksheet answer" for every flag,
   * which became untrue the moment the harm-to-someone screen fired in chat.
   * Absent means the sentence does not name a surface at all.
   */
  surface?: string;
}

/** A date and time a therapist in India reads without translating. */
export function formatAlertTimestamp(at: Date): string {
  const date = at.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const time = at.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${date}, ${time} IST`;
}

export async function sendSafetyAlertEmail(
  params: SendSafetyAlertEmailParams,
): Promise<{ sent: true }> {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM_EMAIL || 'noreply@okuvu.in';
  const fromName = process.env.BREVO_FROM_NAME || 'OKUVU';

  if (!apiKey) {
    const message =
      'BREVO_API_KEY is not set — a safety alert email could NOT be sent. The flag is recorded; nothing reached the therapist.';
    if (process.env.NODE_ENV === 'production') {
      // Thrown, not warned: the caller (lib/safety-flags.ts) logs it loudly
      // and the turn is unaffected. Something has to be able to alarm on it.
      throw new Error(`[email] ALERT ${message}`);
    }
    console.error('[email] ALERT (non-production)', message, {
      toRef: identityRef('c', params.to),
      level: params.level,
    });
    return { sent: true as const };
  }

  const greeting = params.therapistName ? `Hi ${params.therapistName},` : 'Hi,';
  const when = formatAlertTimestamp(params.occurredAt);
  const urgent = params.urgent === true;
  const urgentLine = urgent
    ? `<p><strong>This one is marked urgent.</strong> It was flagged in ${params.surface ?? 'OKUVU'}, ` +
      'and the client&rsquo;s own words are on their Safety card in the portal.</p>'
    : '';
  const htmlContent = `
    <p>${greeting}</p>
    <p><strong>${params.clientLabel}</strong> had an <strong>${params.level}</strong> safety event on ${when}.</p>
    ${urgentLine}
    <p><a href="${params.link}">Review the flag in the portal</a></p>
    <p>Okuvu is not monitored 24/7. Alerts come to you; they do not go to emergency services.</p>
  `;

  const response = await fetch(BREVO_SEND_URL, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: fromEmail, name: fromName },
      to: [{ email: params.to, name: params.therapistName ?? undefined }],
      subject: urgent
        ? `URGENT ${params.level} safety event — ${params.clientLabel}, ${when}`
        : `${params.level} safety event — ${params.clientLabel}, ${when}`,
      htmlContent,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `[email] safety alert send failed: ${response.status} ${redactEmails(body).slice(0, 300)}`,
    );
  }

  return { sent: true };
}

/**
 * The client said they are under 18 — the account will not activate.
 *
 * The therapist has to hear about this: otherwise their roster shows someone
 * who simply never signs in, and the real reason (a safeguarding stop) is
 * invisible. Carries the label, the time and a link; no other detail exists to
 * carry, and email is the wrong place for a clinical note anyway.
 */
export interface SendAgeDeclinedEmailParams {
  to: string;
  therapistName: string | null;
  clientLabel: string;
  declinedAt: Date;
  link: string;
}

export async function sendAgeDeclinedEmail(
  params: SendAgeDeclinedEmailParams,
): Promise<{ sent: boolean }> {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM_EMAIL || 'noreply@okuvu.in';
  const fromName = process.env.BREVO_FROM_NAME || 'OKUVU';
  const when = formatAlertTimestamp(params.declinedAt);

  const greeting = params.therapistName ? `Hi ${params.therapistName},` : 'Hi,';
  const htmlContent = `
    <p>${greeting}</p>
    <p><strong>${params.clientLabel}</strong> did not confirm they are 18 or over on ${when}, so their Okuvu account did not activate.</p>
    <p>Okuvu is for adults only. If you believe this was a mistake, ask them to sign in again and confirm.</p>
    <p><a href="${params.link}">Open their page in the portal</a></p>
  `;

  if (!apiKey) {
    console.warn('[email] BREVO_API_KEY not set — skipping age-decline notice', {
      toRef: identityRef('c', params.to),
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
        to: [{ email: params.to, name: params.therapistName ?? undefined }],
        subject: `${params.clientLabel} could not activate — age not confirmed`,
        htmlContent,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error('[email] Brevo age-decline send failed', {
        status: response.status,
        body: redactEmails(body).slice(0, 500),
      });
      return { sent: false };
    }

    return { sent: true };
  } catch (err) {
    console.error('[email] Brevo age-decline send threw', err);
    return { sent: false };
  }
}
