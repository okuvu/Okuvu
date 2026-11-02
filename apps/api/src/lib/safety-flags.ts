/**
 * Safety flags — the per-event record the therapist portal's Safety card
 * reads.
 *
 * `SafetyState` holds only the current state (one row per user, overwritten
 * every turn), so it can answer "how is this client now" and never "what
 * happened, when, and has anyone looked at it". `SafetyFlag` is that record;
 * this module is its only writer.
 *
 * TWO RULES, both clinical:
 *
 * 1. A flag write must never change what the client receives. The S3
 *    grounding card and the S4 crisis card are served by the orchestrator
 *    before and independently of this module. Every function here catches its
 *    own failures, logs them, and returns; none of them throws into a turn.
 * 2. A failed write is retried, not dropped. Attempt one is awaited (a single
 *    insert, no round trip of its own); later attempts run in the background
 *    with a short backoff. The row is idempotent per turn (turn_id is unique),
 *    so a retry after a timeout that actually committed cannot double-count.
 *
 * No message content is ever stored on a flag — the therapist is shown the
 * event, never the conversation.
 */

import { prisma } from './prisma.js';
import { sendSafetyAlertEmail } from './email.js';
import { identityRef } from './log-identity.js';

export type SafetyFlagSource =
  | 's3_grounding'
  | 'crisis_card'
  | 'third_party_crisis'
  | 'medical_emergency';

/** Only the two levels a therapist is alerted about. S0–S2 are not flags. */
export type SafetyFlagLevelValue = 'S3' | 'S4';

export interface RecordSafetyFlagParams {
  userId: string;
  /** The turn's classified state. Anything but S3/S4 is not recorded. */
  level: string;
  /** Which deterministic screen the client received. */
  source: SafetyFlagSource;
  sessionId?: string | null;
  turnId?: string | null;
  /** Defaults true; passed explicitly so a future detect-only path can say so. */
  crisisScreenShown?: boolean;
}

export interface RecordedSafetyFlag {
  id: string;
  user_id: string;
  level: SafetyFlagLevelValue;
  occurred_at: Date;
}

/** Backoff between write attempts. Attempt 1 is inline; these follow it. */
export const SAFETY_FLAG_RETRY_DELAYS_MS = [250, 1000] as const;

const INSERT_RETRY_DELAYS = SAFETY_FLAG_RETRY_DELAYS_MS;

function isFlagLevel(level: string): level is SafetyFlagLevelValue {
  return level === 'S3' || level === 'S4';
}

/**
 * Prisma's unique-violation code, read structurally rather than by importing
 * the Prisma namespace: the same check has to work against the hand-rolled
 * fake clients the tests use, which throw plain objects.
 */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

async function insertFlag(
  params: RecordSafetyFlagParams,
  level: SafetyFlagLevelValue,
): Promise<RecordedSafetyFlag | null> {
  // A Prisma client generated before this migration has no `safetyFlag`
  // delegate. In compiled code the type makes that impossible; the only way
  // to reach it is a hand-rolled test double, so this is a guard against
  // confusing noise, not a production fallback.
  if (!prisma.safetyFlag) {
    console.warn('[safety-flag] prisma.safetyFlag is unavailable — flag not recorded', {
      level,
      source: params.source,
    });
    return null;
  }
  try {
    const row = await prisma.safetyFlag.create({
      data: {
        user_id: params.userId,
        level,
        source: params.source,
        session_id: params.sessionId ?? null,
        turn_id: params.turnId ?? null,
        crisis_screen_shown: params.crisisScreenShown ?? true,
      },
      select: { id: true, user_id: true, level: true, occurred_at: true },
    });
    return row as RecordedSafetyFlag;
  } catch (err) {
    // Unique violation on turn_id: an earlier attempt committed and only the
    // response was lost. The flag exists — that is success, not failure.
    if (isUniqueViolation(err)) {
      console.info('[safety-flag] insert collided on turn_id — flag already recorded', {
        userRef: identityRef('c', params.userId),
        source: params.source,
      });
      return null;
    }
    throw err;
  }
}

/**
 * Record an S3/S4 flag for this turn. Never throws; never blocks the reply
 * beyond one insert attempt. Returns the row when it was written inline.
 */
export async function recordSafetyFlag(
  params: RecordSafetyFlagParams,
): Promise<RecordedSafetyFlag | null> {
  if (!isFlagLevel(params.level)) return null;
  const level = params.level;

  try {
    return await insertFlag(params, level);
  } catch (firstError) {
    console.error('[safety-flag] WRITE FAILED — retrying in the background', {
      userRef: identityRef('c', params.userId),
      level,
      source: params.source,
      err: firstError instanceof Error ? firstError.message : String(firstError),
    });

    // Deliberately not awaited: the turn has already been served, and a
    // database that just failed is not made better by holding the response.
    void (async () => {
      for (const delay of INSERT_RETRY_DELAYS) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        try {
          const row = await insertFlag(params, level);
          if (row) {
            console.info('[safety-flag] background retry succeeded', {
              userRef: identityRef('c', params.userId),
              level,
            });
            // The first attempt's alert never fired (there was no row to
            // alert on), so send it now that the flag actually exists.
            void notifyTherapistsOfSafetyFlag(row);
          }
          return;
        } catch (err) {
          console.error('[safety-flag] background retry failed', {
            userRef: identityRef('c', params.userId),
            level,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
      console.error('[safety-flag] GAVE UP writing flag after retries', {
        userRef: identityRef('c', params.userId),
        level,
        source: params.source,
      });
    })();

    return null;
  }
}

/**
 * Email each therapist assigned to this client. The body carries the client's
 * label, the level, the time and a link — and nothing else. No message text,
 * no summary, no reasoning note: an inbox is less protected than the portal,
 * and this is the one surface that leaves the building.
 *
 * Never throws. A missing BREVO_API_KEY in production makes
 * sendSafetyAlertEmail throw by design (a safety alert must not fail
 * silently), and this function converts that into a loud log rather than a
 * failed turn — the flag row is already the durable record.
 */
export async function notifyTherapistsOfSafetyFlag(flag: {
  user_id: string;
  level: SafetyFlagLevelValue;
  occurred_at: Date;
}): Promise<void> {
  try {
    const assignments = await prisma.therapistClient.findMany({
      where: { client_user_id: flag.user_id, ended_at: null },
      select: {
        client_label: true,
        therapist: { select: { email: true, name: true } },
      },
    });

    if (assignments.length === 0) {
      console.warn('[safety-flag] no active therapist assignment for flagged client', {
        userRef: identityRef('c', flag.user_id),
      });
      return;
    }

    const portalBase = (process.env.THERAPIST_PORTAL_URL || 'https://okuvu.in').replace(/\/+$/, '');
    const link = `${portalBase}/clients/${flag.user_id}#safety`;

    for (const assignment of assignments) {
      const to = assignment.therapist?.email;
      if (!to) continue;
      try {
        await sendSafetyAlertEmail({
          to,
          therapistName: assignment.therapist?.name ?? null,
          clientLabel: assignment.client_label,
          level: flag.level,
          occurredAt: flag.occurred_at,
          link,
        });
      } catch (err) {
        console.error('[safety-flag] ALERT EMAIL NOT SENT', {
          clientRef: identityRef('c', flag.user_id),
          toRef: identityRef('c', to),
          level: flag.level,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    console.error('[safety-flag] alert lookup failed', {
      userRef: identityRef('c', flag.user_id),
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Record and alert in one call — the shape every orchestrator site uses.
 * Awaits the write (one insert), never the email.
 */
export async function flagSafetyEvent(params: RecordSafetyFlagParams): Promise<void> {
  const flag = await recordSafetyFlag(params);
  if (flag) void notifyTherapistsOfSafetyFlag(flag);
}
