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
    console.warn('[email] BREVO_API_KEY not set — skipping send, invite code logged only', {
      to: params.to,
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
      console.error('[email] Brevo send failed', { status: response.status, body });
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
      to: params.to,
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
      console.error('[email] Brevo waitlist confirmation send failed', { status: response.status, body });
      return { sent: false };
    }

    return { sent: true };
  } catch (err) {
    console.error('[email] Brevo waitlist confirmation send threw', err);
    return { sent: false };
  }
}
