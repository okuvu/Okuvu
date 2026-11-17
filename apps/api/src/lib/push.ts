import { createSign } from 'node:crypto';
import type { PrismaClient } from '@okuvu/prisma';
import { buildPushCopy } from '@okuvu/shared-types';
import { prisma } from './prisma.js';

/**
 * The push sender — the only thing in this codebase that buzzes a closed app.
 *
 * Written against FCM's HTTP v1 API with `node:crypto` rather than the
 * `firebase-admin` SDK, for the same reason the Brevo sender is a bare `fetch`:
 * the image already carries no Google client libraries, the SDK pulls a
 * credential-discovery chain that fails in a way that looks like a network
 * error, and what we need is one signed request. The whole surface here is a
 * JWT assertion, a token exchange, and a POST.
 *
 * Four properties that matter more than the send:
 *
 * 1. **Unconfigured is not an error.** With no service-account JSON in the
 *    environment this logs once and returns `{configured: false}`. A local dev
 *    box and CI call the same code path as production and nothing throws; an
 *    owner who has not yet pasted the key gets a working product without push,
 *    not a crashing api.
 * 2. **The row is the truth, the push is a courtesy.** Every caller writes the
 *    `Notification` row first and swallows this call's failure. A dead token or
 *    an FCM outage must never roll back a therapist's action or hide an inbox row
 *    the client can still read in the app.
 * 3. **Nothing clinical crosses the wire.** `buildPushCopy` lives in
 *    `@okuvu/shared-types` and only ever knows the kind. The stored row's title
 *    and body are deliberately not passed in: they may quote a homework title or
 *    a therapist's note, and a push is rendered on a lock screen anyone can read.
 * 4. **A dead token is deleted, not retried.** FCM answers `UNREGISTERED` for an
 *    uninstalled app; retrying that for ever is how a sender quietly stops
 *    working while its logs fill.
 */

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

export interface PushResult {
  /** False when no service account is configured — push is inert, not broken. */
  configured: boolean;
  sent: number;
  failed: number;
  /** Tokens FCM told us are dead and that have now been deleted. */
  pruned: number;
}

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_BASE = 'https://fcm.googleapis.com/v1/projects';
const TOKEN_LIFETIME_BUFFER_MS = 5 * 60 * 1000;

/** The notification channel the app creates. Must match apps/mobile's constant. */
export const PUSH_CHANNEL_ID = 'okuvu_care_team';

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;
let warnedUnconfigured = false;

/**
 * Parse the service-account credential from the environment.
 *
 * Accepts the JSON either raw or base64-encoded, because Secrets Manager values
 * arrive as a quoted JSON string through ECS `valueFrom` and a multi-line
 * private key survives base64 far more reliably than raw PEM inside a JSON
 * environment value.
 */
export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw) return null;
  let text = raw.trim();
  if (!text) return null;
  if (!text.startsWith('{')) {
    try {
      text = Buffer.from(text, 'base64').toString('utf8').trim();
    } catch {
      return null;
    }
  }
  try {
    const parsed = JSON.parse(text) as Partial<ServiceAccount>;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;
    return {
      project_id: parsed.project_id,
      client_email: parsed.client_email,
      private_key: parsed.private_key.replace(/\\n/g, '\n'),
    };
  } catch {
    return null;
  }
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** The signed assertion Google exchanges for an access token. Pure, so it is testable. */
export function buildAssertion(account: ServiceAccount, now: number): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: FCM_SCOPE,
      aud: TOKEN_URL,
      iat: Math.floor(now / 1000),
      exp: Math.floor(now / 1000) + 3600,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(account.private_key);
  return `${header}.${claims}.${base64url(signature)}`;
}

async function accessToken(account: ServiceAccount, now = Date.now()): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - TOKEN_LIFETIME_BUFFER_MS > now) {
    return cachedToken.accessToken;
  }
  const assertion = buildAssertion(account, now);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`fcm token exchange failed: ${response.status} ${detail.slice(0, 200)}`);
  }
  const json = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error('fcm token exchange returned no access_token');
  cachedToken = {
    accessToken: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600) * 1000,
  };
  return json.access_token;
}

/** Test seam: drop the memoised token so a suite does not leak state. */
export function resetPushTokenCache(): void {
  cachedToken = null;
  warnedUnconfigured = false;
}

/**
 * A token FCM reports as gone. `UNREGISTERED`/`NOT_FOUND` mean an uninstalled
 * app; `INVALID_ARGUMENT` on a token that used to work is the same thing with a
 * worse error name.
 */
export function isDeadTokenError(code: string | undefined, message: string | undefined): boolean {
  if (code === 'UNREGISTERED' || code === 'NOT_FOUND' || code === 'SENDER_ID_MISMATCH') return true;
  const prose = message ?? '';
  if (/not a valid (fcm )?registration token/i.test(prose)) return true;
  // A 404 on a single-token send is the token, whatever the error envelope calls
  // it: the only entity in the request is the registration token.
  if (/requested entity was not found|not registered|unregistered/i.test(prose)) return true;
  return false;
}

export type PushDb = Pick<PrismaClient, 'deviceToken' | 'user'>;

export interface SendToUserInput {
  userId: string;
  kind: string;
  /** Only meaningful for appointment kinds; the push names the time and nothing else. */
  appointmentAt?: Date | null;
  /** Data payload for the tap target. Ids only — the app resolves them. */
  homeworkId?: string | null;
  appointmentId?: string | null;
}

/**
 * Send to every live handset of one client.
 *
 * The preference gate lives here rather than in each caller for the reason the
 * email gate does: a second place that reads the switch is a place that can
 * disagree with this one, and a client who turned push off would still buzz.
 */
export async function sendPushToUser(
  input: SendToUserInput,
  db: PushDb = prisma,
): Promise<PushResult> {
  const account = parseServiceAccount(process.env.FCM_SERVICE_ACCOUNT_JSON);
  if (!account) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn('[PUSH] FCM_SERVICE_ACCOUNT_JSON is not set — push is inert (inbox rows still write)');
    }
    return { configured: false, sent: 0, failed: 0, pruned: 0 };
  }

  // One query answers "may this phone buzz" and "which phones" — the same
  // one-lookup discipline as the email gate, so the two answers cannot disagree
  // mid-send.
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: {
      push_notifications_enabled: true,
      device_tokens: { select: { token: true } },
    },
  });

  const enabled = user?.push_notifications_enabled;
  const tokens = (user?.device_tokens ?? []).map((row) => row.token);
  if (!user || enabled === false || tokens.length === 0) {
    return { configured: true, sent: 0, failed: 0, pruned: 0 };
  }

  const copy = buildPushCopy(input.kind, { appointmentAt: input.appointmentAt ?? null });
  const data: Record<string, string> = { kind: input.kind };
  if (input.homeworkId) data.homeworkId = input.homeworkId;
  if (input.appointmentId) data.appointmentId = input.appointmentId;

  let bearer: string;
  try {
    bearer = await accessToken(account);
  } catch (err) {
    console.error('[PUSH] could not obtain an access token', err);
    return { configured: true, sent: 0, failed: tokens.length, pruned: 0 };
  }

  let sent = 0;
  let failed = 0;
  const dead: string[] = [];

  for (const token of tokens) {
    try {
      const response = await fetch(`${FCM_BASE}/${account.project_id}/messages:send`, {
        method: 'POST',
        headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: copy.title, body: copy.body },
            data,
            android: {
              priority: 'HIGH',
              notification: { channel_id: PUSH_CHANNEL_ID },
            },
          },
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        sent += 1;
        continue;
      }

      failed += 1;
      const detail = (await response.json().catch(() => null)) as
        | { error?: { status?: string; message?: string; details?: { errorCode?: string }[] } }
        | null;
      const code =
        detail?.error?.details?.find((entry) => entry.errorCode)?.errorCode ?? detail?.error?.status;
      if (isDeadTokenError(code, detail?.error?.message)) dead.push(token);
      else console.error(`[PUSH] send failed for a ${input.kind} notification: ${code ?? response.status}`);
    } catch (err) {
      failed += 1;
      console.error(`[PUSH] send threw for a ${input.kind} notification`, err);
    }
  }

  if (dead.length > 0) {
    try {
      await db.deviceToken.deleteMany({ where: { token: { in: dead } } });
    } catch (err) {
      console.error('[PUSH] could not prune dead tokens', err);
    }
  }

  return { configured: true, sent, failed, pruned: dead.length };
}
