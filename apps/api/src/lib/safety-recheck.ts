/**
 * The recheck queue for writes the safety check could not screen.
 *
 * Owner's rule (9 Nov 2026): a failed or slow check is **moderate concern** —
 * never safe, never crisis. The write is saved, the client is offered help, and
 * nobody is alerted; a crisis card on every classifier outage would train
 * therapists to ignore the real ones. What replaces the alert is this queue:
 * every unscreened write is screened again once the classifier answers, and the
 * therapist is alerted **only** if that recheck finds risk.
 *
 * Three properties this module is built around:
 *
 *  1. **A pointer, never the text.** The queue names the row (`subject_kind` +
 *     `subject_id`) and the sweep re-reads it. Copying the writing into a second
 *     table would create a second store with none of the first one's erasure
 *     path.
 *  2. **Idempotent.** A retried save cannot enqueue the same row twice (unique
 *     pair), and the flag it eventually writes is itself unique per subject, so
 *     an outage that produced one write can never produce two alerts.
 *  3. **Never confused with silence.** A sweep that cannot reach a verdict
 *     leaves the row in place with a backoff; only a real verdict removes it.
 *     Giving up is recorded (`abandoned_at`), not swept away, because "we never
 *     screened this" is a fact an operator needs to be able to query.
 *
 * The sweep runs in-process on an interval (`startSafetyRecheckLoop`), which is
 * the same process that owns the classifier: "when the service is back" is
 * precisely when this loop can reach a verdict again. Concurrent instances are
 * safe — the claim is a conditional update, and every effect is idempotent.
 */

import type { SafetyFlagSource } from './safety-flags.js';
import { notifyTherapistsOfSafetyFlag, recordSafetyFlag } from './safety-flags.js';
import { prisma } from './prisma.js';
import { answersToText, checkClientText } from './safety-check.js';
import { identityRef } from './log-identity.js';

/** The three non-chat surfaces, same vocabulary as `SafetyFlag.source`. */
export type RecheckSurface = Extract<
  SafetyFlagSource,
  'journal_entry' | 'worksheet_answer' | 'treasure_note'
>;

const SUBJECT_KIND_BY_SURFACE: Record<RecheckSurface, string> = {
  journal_entry: 'journal_entry',
  worksheet_answer: 'worksheet_response',
  treasure_note: 'treasure_note',
};

/** How long a row waits between attempts while the classifier is still down. */
export const RECHECK_BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000] as const;

/** After this many failed attempts the row is abandoned and logged loudly. */
export const RECHECK_MAX_ATTEMPTS = 8;

/** How many rows one sweep will handle. Keeps a backlog from blocking boot. */
export const RECHECK_BATCH_SIZE = 50;

/** Default sweep cadence. A row is therefore screened within ~2 minutes of the
 * classifier recovering, which is well inside the window a therapist would act. */
export const RECHECK_INTERVAL_MS = 120_000;

export interface EnqueueRecheckParams {
  userId: string;
  surface: RecheckSurface;
  /** The row the text lives on. The recheck re-reads it; the text is not copied. */
  subjectId: string;
  subjectKind?: string;
  /** Injected by tests; defaults to now. */
  now?: Date;
}

/**
 * Queue one unscreened write.
 *
 * Called only when `TextSafetyResult.recheck` is true, i.e. the classifier
 * could not answer and the crisis floor found nothing. Never throws: a queue
 * write that fails must not fail the client's save, and the caller has already
 * logged the degraded check.
 */
export async function enqueueSafetyRecheck(params: EnqueueRecheckParams): Promise<boolean> {
  const subjectKind = params.subjectKind ?? SUBJECT_KIND_BY_SURFACE[params.surface];
  try {
    await prisma.safetyRecheck.upsert({
      where: {
        subject_kind_subject_id: {
          subject_kind: subjectKind,
          subject_id: params.subjectId,
        },
      },
      // A second save of the same row re-queues it from now rather than
      // creating a duplicate: the text changed, so the earlier attempt's
      // verdict (if any) no longer applies.
      update: {
        next_attempt_at: params.now ?? new Date(),
        abandoned_at: null,
        attempts: 0,
      },
      create: {
        user_id: params.userId,
        surface: params.surface,
        subject_kind: subjectKind,
        subject_id: params.subjectId,
        next_attempt_at: params.now ?? new Date(),
      },
      select: { id: true },
    });
    return true;
  } catch (err) {
    console.error('[safety-recheck] could not queue unscreened write', {
      userRef: identityRef('c', params.userId),
      surface: params.surface,
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/** Re-read the text a queue row points at. Null when the row no longer exists. */
async function loadSubjectText(
  subjectKind: string,
  subjectId: string,
): Promise<{ userId: string; text: string } | null> {
  if (subjectKind === 'journal_entry') {
    const row = await prisma.journalEntry.findUnique({
      where: { id: subjectId },
      select: { user_id: true, content: true },
    });
    return row ? { userId: row.user_id, text: row.content ?? '' } : null;
  }

  if (subjectKind === 'worksheet_response') {
    const row = await prisma.worksheetResponse.findUnique({
      where: { id: subjectId },
      select: { user_id: true, answers: true, barriers: true },
    });
    if (!row) return null;
    const text = [answersToText(row.answers), row.barriers ?? '']
      .filter((part) => part.length > 0)
      .join('\n');
    return { userId: row.user_id, text };
  }

  if (subjectKind === 'treasure_note') {
    const row = await prisma.treasureNote.findUnique({
      where: { id: subjectId },
      select: { user_id: true, title: true, body: true },
    });
    if (!row) return null;
    return {
      userId: row.user_id,
      text: [row.title ?? '', row.body].filter((part) => part.length > 0).join('\n'),
    };
  }

  return null;
}

export interface RecheckSweepResult {
  checked: number;
  flagged: number;
  cleared: number;
  stillUnscreened: number;
  abandoned: number;
  missing: number;
}

function backoffFor(attempts: number): number {
  const index = Math.min(attempts, RECHECK_BACKOFF_MS.length - 1);
  return RECHECK_BACKOFF_MS[index];
}

/**
 * Screen every due queue row once.
 *
 * Per row: re-read the text, run the SAME check the write paths run, then
 *  - S3/S4 → record the flag (which sends the therapist's alert, no content),
 *    and delete the queue row;
 *  - a clean verdict → delete the queue row;
 *  - still unscreened → back off, or abandon after `RECHECK_MAX_ATTEMPTS`;
 *  - the subject is gone → drop the row (the text no longer exists).
 *
 * Never throws: one bad row must not stop the sweep.
 */
export async function runSafetyRecheckSweep(
  options: { now?: Date; limit?: number } = {},
): Promise<RecheckSweepResult> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? RECHECK_BATCH_SIZE;
  const result: RecheckSweepResult = {
    checked: 0,
    flagged: 0,
    cleared: 0,
    stillUnscreened: 0,
    abandoned: 0,
    missing: 0,
  };

  let due: Array<{
    id: string;
    user_id: string;
    surface: string;
    subject_kind: string;
    subject_id: string;
    attempts: number;
  }>;

  try {
    due = await prisma.safetyRecheck.findMany({
      where: { next_attempt_at: { lte: now }, abandoned_at: null },
      orderBy: { next_attempt_at: 'asc' },
      take: limit,
      select: {
        id: true,
        user_id: true,
        surface: true,
        subject_kind: true,
        subject_id: true,
        attempts: true,
      },
    });
  } catch (err) {
    console.error('[safety-recheck] could not read the queue', {
      err: err instanceof Error ? err.message : String(err),
    });
    return result;
  }

  for (const row of due) {
    result.checked += 1;

    // Claim the row: only the instance that moved next_attempt_at forward
    // screens it, so two running APIs cannot both alert on the same write.
    // The flag itself is unique per subject, so this is defence in depth.
    try {
      const claimed = await prisma.safetyRecheck.updateMany({
        where: { id: row.id, next_attempt_at: { lte: now }, abandoned_at: null },
        data: { next_attempt_at: new Date(now.getTime() + RECHECK_BACKOFF_MS[0]) },
      });
      if (claimed.count === 0) continue;
    } catch (err) {
      console.error('[safety-recheck] could not claim a queue row', {
        id: row.id,
        err: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    try {
      const subject = await loadSubjectText(row.subject_kind, row.subject_id);
      if (!subject) {
        // The client deleted the entry: there is nothing left to screen.
        await prisma.safetyRecheck.delete({ where: { id: row.id } });
        result.missing += 1;
        continue;
      }

      const safety = await checkClientText(subject.text);

      if (safety.flagged) {
        // Awaited here, unlike the write paths: this is already a background
        // job, so there is no client waiting, and a job that finishes without
        // knowing whether the alert went out is a job nobody can reason about.
        const flag = await recordSafetyFlag({
          userId: row.user_id,
          level: safety.level,
          source: row.surface as RecheckSurface,
          subjectKind: row.subject_kind,
          subjectId: row.subject_id,
        });
        if (flag) await notifyTherapistsOfSafetyFlag(flag);
        await prisma.safetyRecheck.delete({ where: { id: row.id } });
        result.flagged += 1;
        console.warn('[safety-recheck] a rechecked write was flagged — therapist alerted', {
          userRef: identityRef('c', row.user_id),
          surface: row.surface,
          level: safety.level,
        });
        continue;
      }

      if (!safety.degraded) {
        await prisma.safetyRecheck.delete({ where: { id: row.id } });
        result.cleared += 1;
        continue;
      }

      const attempts = row.attempts + 1;
      if (attempts >= RECHECK_MAX_ATTEMPTS) {
        await prisma.safetyRecheck.update({
          where: { id: row.id },
          data: { attempts, abandoned_at: now },
        });
        result.abandoned += 1;
        console.error('[safety-recheck] GAVE UP screening a write', {
          userRef: identityRef('c', row.user_id),
          surface: row.surface,
          subject_kind: row.subject_kind,
          subject_id: row.subject_id,
          attempts,
        });
        continue;
      }

      await prisma.safetyRecheck.update({
        where: { id: row.id },
        data: {
          attempts,
          next_attempt_at: new Date(now.getTime() + backoffFor(attempts)),
        },
      });
      result.stillUnscreened += 1;
    } catch (err) {
      console.error('[safety-recheck] recheck failed for one row', {
        id: row.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

let loopTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the in-process sweep.
 *
 * Off when `SAFETY_RECHECK_INTERVAL_MS` is `0` (tests, and any deployment that
 * would rather drive the sweep itself), and unref'd so it never keeps the
 * process alive on shutdown.
 */
export function startSafetyRecheckLoop(log: {
  info: (obj: Record<string, unknown>, msg?: string) => void;
}): void {
  if (loopTimer) return;

  const raw = process.env.SAFETY_RECHECK_INTERVAL_MS;
  const interval = raw === undefined ? RECHECK_INTERVAL_MS : Number(raw);
  if (!Number.isFinite(interval) || interval <= 0) {
    log.info({ event: 'safety_recheck_loop_disabled' }, 'Safety recheck loop is disabled');
    return;
  }

  loopTimer = setInterval(() => {
    void runSafetyRecheckSweep()
      .then((summary) => {
        if (summary.checked > 0) {
          log.info({ event: 'safety_recheck_swept', ...summary }, 'Safety recheck swept');
        }
      })
      .catch((err: unknown) => {
        log.info(
          {
            event: 'safety_recheck_sweep_failed',
            err: err instanceof Error ? err.message : String(err),
          },
          'Safety recheck sweep failed',
        );
      });
  }, interval);
  loopTimer.unref?.();

  log.info(
    { event: 'safety_recheck_loop_started', interval_ms: interval },
    'Safety recheck loop started',
  );
}
