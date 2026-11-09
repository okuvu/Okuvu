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

/**
 * How long a send may hold the therapist's request open. Client-notification
 * email is sent inside the mutation that writes the inbox row, so a Brevo
 * connection that never answers must give up rather than pin a form submit.
 */
const EMAIL_SEND_TIMEOUT_MS = 5_000;

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

/**
 * ── Portal P0 — invite after tester access ───────────────────────────────
 *
 * The app is on Play internal testing, and internal testing only works for
 * Google accounts on the tester list. So a therapist adding a client does NOT
 * email them: an invite sent before the operator adds the address is a dead
 * link the client cannot use, and the client has no way to tell anyone.
 *
 * The handover is therefore three steps, in this order:
 *   1. therapist adds the client            → row, no email, status
 *                                             "waiting for app access"
 *   2. operator adds the address to the
 *      tester group and marks it in /admin  → admin.markTesterAccessAdded
 *   3. that action sends this email         → status "invited · not signed
 *                                             in yet"
 *
 * No Play Developer API call: the tester-list step is manual on purpose for
 * beta, and pretending otherwise would hide a step the operator still has to
 * take.
 */

/** The one download URL. Never invented, never defaulted: absent in
 * production is a hard failure, because an invite email with no link is a
 * promise the team cannot see failing. */
export function requirePlayTestUrl(): string {
  const url = (process.env.PLAY_INTERNAL_TEST_URL ?? '').trim();
  if (!url) {
    console.error(
      '[email] PLAY_INTERNAL_TEST_URL is not set — refusing to send an invite email with no way to install Okuvu',
    );
    throw new Error('PLAY_INTERNAL_TEST_URL is not set');
  }
  return url;
}

export interface SendClientInviteEmailParams {
  /** The client's Google address — the identity their sign-in binds to. */
  to: string;
  therapistName: string;
}

/**
 * Note what is NOT in this email: the therapist's label for the client, and
 * any clinical content. The label is one therapist's private name for a
 * person and the client must never see it (they set their own name in the
 * app), so the greeting carries no name at all.
 */
export async function sendClientInviteEmail(
  params: SendClientInviteEmailParams,
): Promise<{ sent: boolean }> {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM_EMAIL || 'noreply@okuvu.in';
  const fromName = process.env.BREVO_FROM_NAME || 'OKUVU';
  const downloadUrl = requirePlayTestUrl();

  const htmlContent = `
    <p>Hi,</p>
    <p>${escapeHtml(params.therapistName)} has invited you to Okuvu, a wellbeing companion you can use between sessions.</p>
    <p>Open this link on your Android phone while signed in to ${escapeHtml(params.to)}:</p>
    <p><a href="${escapeHtml(downloadUrl)}">${escapeHtml(downloadUrl)}</a></p>
    <p>Sign in with the same Google account (${escapeHtml(params.to)}). If you use a different address, the app will not recognise you.</p>
    <p>Okuvu is for adults 18 and over. You will be asked to confirm this the first time you sign in.</p>
    <p>Okuvu is not an emergency service. If you are in danger now, call 112.</p>
  `;

  if (!apiKey) {
    console.warn('[email] BREVO_API_KEY not set — skipping invite send', {
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
        subject: `${params.therapistName} has invited you to Okuvu`,
        htmlContent,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error('[email] Brevo invite send failed', {
        status: response.status,
        body: redactEmails(body).slice(0, 500),
      });
      return { sent: false };
    }

    return { sent: true };
  } catch (err) {
    console.error('[email] Brevo invite send threw', err);
    return { sent: false };
  }
}

/** Where "add this address to the tester group" notifications go. */
export function testerRequestRecipient(): string {
  const allowlist = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return process.env.TESTER_GROUP_NOTIFY_EMAIL || allowlist[0] || 'admin@okuvu.in';
}

export interface SendAdminTesterRequestEmailParams {
  /** The address the operator has to add to the Play tester Google Group. */
  clientEmail: string;
  /** The therapist's private label — fine here: the recipient is the operator,
   * who already sees it in the console, not the client. */
  clientLabel: string;
  therapistName: string;
  therapistEmail: string;
}

export async function sendAdminTesterRequestEmail(
  params: SendAdminTesterRequestEmailParams,
): Promise<{ sent: boolean }> {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM_EMAIL || 'noreply@okuvu.in';
  const fromName = process.env.BREVO_FROM_NAME || 'OKUVU';
  const to = testerRequestRecipient();

  const htmlContent = `
    <p>A therapist added a client and is waiting for app access.</p>
    <ul>
      <li><strong>Add this address to the Play internal-testing Google Group:</strong> ${escapeHtml(params.clientEmail)}</li>
      <li>Client label: ${escapeHtml(params.clientLabel)}</li>
      <li>Therapist: ${escapeHtml(params.therapistName)} &lt;${escapeHtml(params.therapistEmail)}&gt;</li>
    </ul>
    <p>Once the address is on the tester list, open the client in the admin console and use
    “Mark tester access added” — that sends the invite email with the download link.</p>
  `;

  if (!apiKey) {
    console.warn('[email] BREVO_API_KEY not set — tester request stored in the console only', {
      toRef: identityRef('c', to),
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
        to: [{ email: to }],
        subject: `Add to Play tester group: ${params.clientEmail}`,
        htmlContent,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error('[email] Brevo tester-request send failed', {
        status: response.status,
        body: redactEmails(body).slice(0, 500),
      });
      return { sent: false };
    }

    return { sent: true };
  } catch (err) {
    console.error('[email] Brevo tester-request send threw', err);
    return { sent: false };
  }
}

/**
 * The delivery half of the client inbox.
 *
 * Every therapist action (homework assigned, reminder set, appointment booked /
 * moved / cancelled) writes a `Notification` row in the same request. That row
 * is the single source of truth the app's bell and inbox read. This sender hangs
 * off the same row: it is not a second pipeline, and it carries no state of its
 * own — if it fails, the row still exists and the client still finds the item
 * when they open the app.
 *
 * Why email and not push yet: push needs a Firebase project, device tokens and
 * an FCM sender, none of which exist. Email does not buzz a pocket, but it does
 * reach a client who does not open the app, and every client the portal
 * registers has an address because email became the sign-in identity.
 *
 * ## What it may carry, and nothing else
 *
 * The inbox row legitimately contains clinical text — the homework body is an
 * excerpt of the therapist's note. Email does not get that text. A phone sits
 * face up on a shared table and an inbox preview is read by whoever is nearest.
 * So this payload is logistics only: a generic "something new", or for an
 * appointment the date and time. No homework text, no reminder text, no
 * therapist name, no session mode or reason.
 *
 * There is also no link. Clients redeem and use Okuvu inside the Android app;
 * there is no authenticated web surface to deep-link into, and minting a token
 * in a URL would put a credential in a mailbox.
 */
export interface ClientNotificationEmailContext {
  /** `Notification.kind`. Unknown values degrade to the generic wording. */
  kind: string;
  /** Appointment kinds only: the session time the copy refers to. */
  scheduledAt?: Date | null;
}

export interface SendClientNotificationEmailParams extends ClientNotificationEmailContext {
  /** The client's Google address — the identity their sign-in binds to. */
  to: string;
}

export interface ClientNotificationEmailCopy {
  subject: string;
  htmlContent: string;
}

const IST = 'Asia/Kolkata';

/** A date and time a client in India reads without translating. */
export function formatSessionTime(at: Date): string {
  const day = at.toLocaleDateString('en-IN', {
    timeZone: IST,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const time = at.toLocaleTimeString('en-IN', {
    timeZone: IST,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  // en-IN renders "Sat, 7 Nov"; the comma is noise inside a sentence.
  return `${day.replace(',', '')}, ${time} IST`;
}

const GENERIC_SUBJECT = 'Something new from your care team';
const GENERIC_BODY =
  "There's something new for you in Okuvu. Open the app to see it.";

/**
 * Pure copy builder, exported so the tests can pin the wording without a
 * network call. Anything that varies by client or by clinical content must not
 * appear here — see the disclosure note above.
 */
export function buildClientNotificationEmailCopy(
  params: ClientNotificationEmailContext,
): ClientNotificationEmailCopy {
  const when =
    params.scheduledAt instanceof Date && !Number.isNaN(params.scheduledAt.getTime())
      ? formatSessionTime(params.scheduledAt)
      : null;

  let subject = GENERIC_SUBJECT;
  let line = GENERIC_BODY;

  switch (params.kind) {
    case 'appointment_booked':
      subject = 'Your session on Okuvu is confirmed';
      line = when
        ? `Your session is on ${when}. Open Okuvu for the details.`
        : 'Your session is confirmed. Open Okuvu for the details.';
      break;
    case 'appointment_rescheduled':
      subject = 'Your session on Okuvu has moved';
      line = when
        ? `Your session is now on ${when}. Open Okuvu for the details.`
        : 'Your session has been moved. Open Okuvu for the new time.';
      break;
    case 'appointment_cancelled':
      subject = 'Your session on Okuvu was cancelled';
      line = when
        ? `Your session on ${when} has been cancelled. Open Okuvu for the details.`
        : 'Your session has been cancelled. Open Okuvu for the details.';
      break;
    default:
      // homework_assigned, reminder_set, and any kind added later without its
      // own wording: generic by design, never "fall through to the inbox body".
      break;
  }

  const htmlContent = `
    <p>Hi,</p>
    <p>${escapeHtml(line)}</p>
    <p>You are getting this because your therapist uses Okuvu. Reply to this
    address if you would rather not receive these emails.</p>
    <p>Okuvu is not an emergency service. If you are in danger now, call 112.</p>
  `;

  return { subject, htmlContent };
}

/**
 * Send one notification email. Never throws: the notification row is already
 * written and the therapist's action is already committed, so a Brevo outage
 * must not surface as a failed form.
 *
 * Bounded on purpose. The portal request that triggered this waits for it, so a
 * hung Brevo connection would hold a therapist's "Assign homework" click open.
 * The abort keeps the worst case to a few seconds instead of the socket default.
 */
export async function sendClientNotificationEmail(
  params: SendClientNotificationEmailParams,
): Promise<{ sent: boolean }> {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM_EMAIL || 'noreply@okuvu.in';
  const fromName = process.env.BREVO_FROM_NAME || 'OKUVU';
  const { subject, htmlContent } = buildClientNotificationEmailCopy(params);

  if (!apiKey) {
    console.warn('[email] BREVO_API_KEY not set — skipping client notification email', {
      toRef: identityRef('c', params.to),
      kind: params.kind,
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
        subject,
        htmlContent,
      }),
      signal: AbortSignal.timeout(EMAIL_SEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error('[email] Brevo client notification send failed', {
        status: response.status,
        kind: params.kind,
        body: redactEmails(body).slice(0, 500),
      });
      return { sent: false };
    }

    return { sent: true };
  } catch (err) {
    console.error('[email] Brevo client notification send threw', {
      kind: params.kind,
      err,
    });
    return { sent: false };
  }
}
