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
