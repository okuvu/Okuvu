/**
 * Push, from the portal's side: ask the api to buzz this client's phone.
 *
 * The portal is where therapist actions write the `Notification` row, but the
 * FCM credential and the lock-screen copy belong in exactly one deployable, so
 * this is a thin call to the api's internal route rather than a second sender.
 * That also means the portal cannot put clinical text on a lock screen: it sends
 * a kind, and the api builds the wording.
 *
 * Three properties, all deliberate:
 *
 * 1. **Non-throwing.** Same contract as `sendClientNotificationEmail`: the row is
 *    the record of care, and a push that fails must cost a missing buzz, never the
 *    row and never the therapist's form submit.
 * 2. **Bounded.** 5s timeout, because this runs inside the therapist's mutation
 *    and an FCM connection that never answers must not pin it.
 * 3. **Inert when unconfigured.** Without `PUSH_INTERNAL_URL` or
 *    `PUSH_INTERNAL_SECRET` it logs once and returns, so local dev and CI behave
 *    exactly like an owner who has not wired Firebase yet.
 */

import { identityRef } from '@/lib/log-identity';

const TIMEOUT_MS = 5_000;

let warnedUnconfigured = false;

export interface SendClientPushParams {
  clientUserId: string;
  /** A `NotificationKind`. The api turns it into lock-screen wording. */
  kind: string;
  /** Only appointment kinds use it, and only to name the time. */
  appointmentAt?: Date | null;
  homeworkId?: string | null;
  appointmentId?: string | null;
}

export async function sendClientPush(params: SendClientPushParams): Promise<{ sent: boolean }> {
  const base = process.env.PUSH_INTERNAL_URL?.replace(/\/+$/, '');
  const secret = process.env.PUSH_INTERNAL_SECRET;

  if (!base || !secret) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn('[PUSH] PUSH_INTERNAL_URL/SECRET are not set — no push will be sent');
    }
    return { sent: false };
  }

  try {
    const response = await fetch(`${base}/internal/push/notify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-okuvu-internal': secret },
      body: JSON.stringify({
        userId: params.clientUserId,
        kind: params.kind,
        appointmentAt: params.appointmentAt ? params.appointmentAt.toISOString() : null,
        homeworkId: params.homeworkId ?? null,
        appointmentId: params.appointmentId ?? null,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(
        `[PUSH] api refused a ${params.kind} push for ${identityRef('u', params.clientUserId)}: ${response.status}`,
      );
      return { sent: false };
    }

    const result = (await response.json().catch(() => null)) as
      | { configured?: boolean; sent?: number }
      | null;
    return { sent: (result?.sent ?? 0) > 0 };
  } catch (err) {
    console.error(`[PUSH] ${params.kind} push could not be sent`, err);
    return { sent: false };
  }
}

export interface BroadcastPushParams {
  /** One of `BROADCAST_KINDS`. The api rejects anything else. */
  kind: string;
  title: string;
  body: string;
  /**
   * Stable id for this send. The api keys both the inbox rows and the daily cap
   * on it, so a retried request writes no second row and buzzes no phone twice.
   * Callers mint one per press, not per attempt.
   */
  campaignId: string;
}

export interface BroadcastPushResult {
  sent: boolean;
  recipients: number;
  rowsWritten: number;
  pushed: number;
  skippedForCap: number;
}

/**
 * Admin → everyone, over the same hop.
 *
 * The admin's own words travel (unlike a therapist send, which names a kind),
 * because a notice is by definition the admin's copy. What still cannot happen:
 * those words reaching a lock screen — the api's push copy is fixed to "News
 * from OKUVU" and the stored row carries the text.
 *
 * Unlike `sendClientPush`, a failure here *is* reported to the caller: an admin
 * who pressed send and is told "sent" when nothing was written has no way to
 * notice, whereas a therapist's form submit must not fail because of a buzz.
 */
export async function sendBroadcastPush(params: BroadcastPushParams): Promise<BroadcastPushResult> {
  const empty: BroadcastPushResult = { sent: false, recipients: 0, rowsWritten: 0, pushed: 0, skippedForCap: 0 };
  const base = process.env.PUSH_INTERNAL_URL?.replace(/\/+$/, '');
  const secret = process.env.PUSH_INTERNAL_SECRET;

  if (!base || !secret) {
    console.warn('[PUSH] broadcast refused: PUSH_INTERNAL_URL/SECRET are not set');
    return empty;
  }

  try {
    const response = await fetch(`${base}/internal/push/broadcast`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-okuvu-internal': secret },
      body: JSON.stringify({
        kind: params.kind,
        title: params.title,
        body: params.body,
        campaignId: params.campaignId,
      }),
      // Longer than the single-client timeout: this fans out to every client and
      // then pushes to each eligible phone in turn. Still bounded, because the
      // admin's browser is waiting on it.
      signal: AbortSignal.timeout(55_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(`[PUSH] broadcast refused by the api: ${response.status} ${detail.slice(0, 200)}`);
      return empty;
    }

    const result = (await response.json().catch(() => null)) as
      | Omit<BroadcastPushResult, 'sent'>
      | null;
    if (!result) return empty;

    return {
      sent: (result.rowsWritten ?? 0) > 0,
      recipients: result.recipients ?? 0,
      rowsWritten: result.rowsWritten ?? 0,
      pushed: result.pushed ?? 0,
      skippedForCap: result.skippedForCap ?? 0,
    };
  } catch (err) {
    console.error('[PUSH] broadcast could not be sent', err);
    return empty;
  }
}
