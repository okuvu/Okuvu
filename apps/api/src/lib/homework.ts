import { prisma } from './prisma.js';

export interface ActiveHomework {
  id: string;
  description: string;
}

// Single source of truth for "a client's current active homework
// assignment." Previously reimplemented independently in lib/agent-context.ts
// and (necessarily, since apps/worker can't import from apps/api/src/lib)
// apps/worker/src/lib/summary.ts — see the cross-reference comment there.
// If what counts as "active" ever changes, that worker copy needs the same
// change made by hand.
//
// "Active" excludes an assignment already done today (IST). A one-off closes
// outright, but a repeating one stays `active` so it returns on its next due
// day — and the today card's single `homework` field was reading straight
// `status = 'active'`, so a client who did this morning's exercise kept being
// shown it all day (clinical authority, 23 Nov 2026). The Today card's `next`
// field already excluded it; this makes the plain field agree.
export async function getActiveHomework(
  clientUserId: string,
  now: Date = new Date(),
): Promise<ActiveHomework | null> {
  const row = await prisma.homework.findFirst({
    where: {
      client_user_id: clientUserId,
      status: 'active',
      OR: [{ last_completed_at: null }, { last_completed_at: { lt: startOfIstDay(now) } }],
    },
    orderBy: { assigned_at: 'desc' },
    select: { id: true, description: true },
  });

  return row ?? null;
}

// ─── Repeating assignments (owner's Step 6 correction) ──────────────────
//
// A therapist can set an assignment to repeat. Finishing it once must not
// close it: today is done, and it comes back on its next due day. Only a
// one-off assignment closes when finished.
//
// The cadence vocabulary is the one Reminder already uses
// ('once' | 'once_daily' | 'twice_daily' | 'thrice_daily' | 'as_needed'), so
// nothing new is invented here. 'once' and a null frequency are one-off.

const IST_OFFSET_MINUTES = 330;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isRepeatingFrequency(frequency: string | null | undefined): boolean {
  return (
    frequency === 'once_daily' ||
    frequency === 'twice_daily' ||
    frequency === 'thrice_daily' ||
    frequency === 'as_needed'
  );
}

/**
 * The start of the client's day in IST, as an instant.
 *
 * The Today card's "already done today" rule is about the client's day, not
 * UTC's: done at 23:30 IST is still today for them, while UTC would already
 * have rolled over. One helper, used by the card and the completion write, so
 * the two cannot disagree about when "today" ended.
 */
export function startOfIstDay(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000);
  const midnightUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(midnightUtc - IST_OFFSET_MINUTES * 60_000);
}

export function endOfIstDay(now: Date = new Date()): Date {
  return new Date(startOfIstDay(now).getTime() + DAY_MS - 1);
}

/** Reads "HH:mm" as an IST time-of-day, or null when it is not one. */
function parseIstTimeOfDay(value: string | null | undefined): { hours: number; minutes: number } | null {
  if (typeof value !== 'string') return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

/**
 * When a repeating assignment next comes due: the start of the next IST day,
 * moved to the therapist's reminder time when one was set.
 *
 * Deliberately "next day" and not "in N hours": twice- and thrice-daily exist
 * in the vocabulary, but an assignment is a piece of work, not a dose, and the
 * owner's rule is "show it again on its next due day". A same-day second
 * appearance would turn the card into a counter.
 */
export function nextDueAt(
  homework: {
    frequency: string | null;
    reminder_time: string | null;
    due_at: Date | null;
  },
  now: Date = new Date(),
): Date {
  const tomorrowStart = new Date(startOfIstDay(now).getTime() + DAY_MS);
  const time = parseIstTimeOfDay(homework.reminder_time);

  if (time) {
    return new Date(
      tomorrowStart.getTime() + (time.hours * 60 + time.minutes) * 60_000,
    );
  }

  if (homework.due_at) {
    const carried = new Date(homework.due_at.getTime() + DAY_MS);
    // A due date far in the past (the client came back after a week) must not
    // leave the assignment still due — the next showing is after today.
    return carried.getTime() > tomorrowStart.getTime() ? carried : tomorrowStart;
  }

  return tomorrowStart;
}

export type CompleteHomeworkResult =
  | {
      status: 'ok';
      homeworkStatus: string;
      repeats: boolean;
      /** ISO timestamp of the next showing; null for a one-off assignment. */
      nextDueAt: string | null;
    }
  | { status: 'not_found' };

export interface HomeworkSchedule {
  frequency: string | null;
  reminder_time: string | null;
  due_at: Date | null;
}

/**
 * The one statement that records a completion.
 *
 * Exported so the worksheet save — which already has the assignment row in
 * hand and must not re-query it — applies exactly the same rule as the Mark
 * done button. Two call sites, one decision about whether the assignment
 * closes or comes back.
 */
export function buildCompletionWrite(
  homework: HomeworkSchedule,
  now: Date = new Date(),
): {
  repeats: boolean;
  next: Date | null;
  data: {
    status: 'active' | 'completed';
    last_completed_at: Date;
    due_at?: Date;
  };
} {
  const repeats = isRepeatingFrequency(homework.frequency);
  if (!repeats) {
    return {
      repeats: false,
      next: null,
      data: { status: 'completed', last_completed_at: now },
    };
  }

  const next = nextDueAt(homework, now);
  return {
    repeats: true,
    next,
    data: { status: 'active', last_completed_at: now, due_at: next },
  };
}

/**
 * Records a "done" for an assignment.
 *
 * One implementation for both entry points — the app's Mark done button and a
 * finished worksheet — because they must agree about whether the assignment
 * closed or is coming back.
 */
export async function completeHomework(
  clientUserId: string,
  homeworkId: string,
  source: 'client' | 'worksheet' | 'exercise' = 'client',
): Promise<CompleteHomeworkResult> {
  const homework = await prisma.homework.findUnique({
    where: { id: homeworkId },
    select: {
      client_user_id: true,
      status: true,
      frequency: true,
      reminder_time: true,
      due_at: true,
    },
  });

  if (!homework || homework.client_user_id !== clientUserId) {
    return { status: 'not_found' };
  }

  if (homework.status !== 'active') {
    // Already closed (or cancelled). Answering `ok` keeps the client's tap
    // idempotent instead of showing an error for a race.
    return {
      status: 'ok',
      homeworkStatus: homework.status,
      repeats: false,
      nextDueAt: null,
    };
  }

  const write = buildCompletionWrite(homework);

  const updated = await prisma.homework.update({
    where: { id: homeworkId },
    data: write.data,
  });

  // History, not state: a repeating assignment is done many times, and the
  // Today card's "not again today" rule reads this rather than a single
  // overwritten timestamp.
  try {
    await prisma.homeworkCompletion.create({
      data: { homework_id: homeworkId, client_user_id: clientUserId, source },
    });
  } catch {
    // The assignment's own state is already correct; a missing history row
    // must not fail the client's tap.
  }

  return {
    status: 'ok',
    homeworkStatus: updated.status,
    repeats: write.repeats,
    nextDueAt: write.next ? write.next.toISOString() : null,
  };
}

export type CompletePracticeResult =
  | { outcome: 'completed'; homeworkId: string; repeats: boolean; nextDueAt: string | null }
  | { outcome: 'already_done_today'; homeworkId: string }
  | { outcome: 'not_assigned' };

/**
 * Records a completion for the assignment of one exercise, after the app's
 * player has actually run it to its end.
 *
 * The client's "Mark done" button is gone (clinical authority, 23 Nov 2026):
 * a one-tap claim cannot be told apart from a lie, so the only thing that
 * closes an exercise assignment is the exercise finishing in the player — the
 * same shape a worksheet already had. The server keys on the tool, not the
 * homework id, because the client can reach an exercise from the Breathe tab
 * or from a chat tool card where no homework id is in hand.
 *
 * What this can and cannot prove: it proves the app reported a finished
 * session, which a client can still imitate by calling the endpoint directly.
 * It cannot prove the body did the breathing. That is a limit of running on
 * the client's own device, and it is why the honest wording in the portal
 * report card stays "reported", not "verified".
 */
export async function completePracticeForTool(
  clientUserId: string,
  toolId: string,
  now: Date = new Date(),
): Promise<CompletePracticeResult> {
  const assignment = await prisma.homework.findFirst({
    where: { client_user_id: clientUserId, tool_id: toolId, status: 'active' },
    orderBy: [{ due_at: 'asc' }, { assigned_at: 'asc' }],
    select: { id: true, frequency: true, last_completed_at: true },
  });

  if (!assignment) {
    return { outcome: 'not_assigned' };
  }

  // A repeating assignment stays active after today's completion, and the
  // player can be run again; a second row would count the same day twice.
  if (
    assignment.last_completed_at !== null &&
    assignment.last_completed_at.getTime() >= startOfIstDay(now).getTime()
  ) {
    return { outcome: 'already_done_today', homeworkId: assignment.id };
  }

  const result = await completeHomework(clientUserId, assignment.id, 'exercise');
  if (result.status === 'not_found') {
    return { outcome: 'not_assigned' };
  }

  return {
    outcome: 'completed',
    homeworkId: assignment.id,
    repeats: result.repeats,
    nextDueAt: result.nextDueAt,
  };
}
