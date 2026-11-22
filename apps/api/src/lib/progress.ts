import { prisma } from './prisma.js';
import { getISTDateString, istDateToUtcMidnight } from '@okuvu/shared-types';
import { moodLabel } from '@okuvu/shared-types/mood';

export type LogFn = (obj: Record<string, unknown>, msg: string) => void;

export type MoodCheckinResult =
  | { status: 'ok'; dateIst: string; id: string; userId: string }
  | { status: 'user_not_found' };

export interface MoodCheckinExtras {
  /** The two screens the approved document adds after the check-in. */
  trigger?: string | null;
  intensity?: number | null;
  /**
   * The check-in's own optional answers. `undefined` means "not mentioned", so a
   * re-tap that only moves the face leaves the words alone; an empty array means
   * "the client cleared them", which is a real answer and is written.
   */
  feelingWords?: string[];
  feelingOther?: string | null;
  /** 1-5, or null when the client left the slider alone. */
  strength?: number | null;
}

export async function recordMoodCheckin(
  authSubject: string,
  moodValue: number,
  log?: { info: LogFn },
  extra?: MoodCheckinExtras,
): Promise<MoodCheckinResult> {
  const user = await prisma.user.findUnique({
    where: { auth_subject: authSubject },
    select: { id: true },
  });

  if (!user) {
    return { status: 'user_not_found' };
  }

  const dateIst = getISTDateString();

  // `date_ist` is a Prisma DateTime (@db.Date). A bare "YYYY-MM-DD" string is
  // rejected at client validation ("premature end of input. Expected
  // ISO-8601 DateTime"), which made every check-in a 500 — the app showed
  // "Couldn't save your check-in" and the row was never written. The column
  // stores a calendar date, so the value is that date at UTC midnight, the
  // same convention getMoodHistory reads back with.
  const dateIstValue = istDateToUtcMidnight(dateIst);

  const row = await prisma.moodLog.upsert({
    where: {
      user_id_date_ist: {
        user_id: user.id,
        date_ist: dateIstValue,
      },
    },
    create: {
      user_id: user.id,
      mood_value: moodValue,
      date_ist: dateIstValue,
      source: 'user_input',
      trigger_text: extra?.trigger ?? null,
      intensity_0_10: extra?.intensity ?? null,
      feeling_words: extra?.feelingWords ?? [],
      feeling_other: extra?.feelingOther ?? null,
      strength_1_5: extra?.strength ?? null,
    },
    update: {
      mood_value: moodValue,
      source: 'user_input',
      ...(extra?.trigger !== undefined ? { trigger_text: extra.trigger } : {}),
      ...(extra?.intensity !== undefined ? { intensity_0_10: extra.intensity } : {}),
      ...(extra?.feelingWords !== undefined ? { feeling_words: extra.feelingWords } : {}),
      ...(extra?.feelingOther !== undefined ? { feeling_other: extra.feelingOther } : {}),
      ...(extra?.strength !== undefined ? { strength_1_5: extra.strength } : {}),
    },
    select: { id: true },
  });

  if (log) {
    log.info(
      {
        event: 'mood_checkin',
        user_id: user.id,
        date: dateIst,
        mood_value: moodValue,
        word_count: extra?.feelingWords?.length ?? 0,
        has_other: Boolean(extra?.feelingOther),
        strength: extra?.strength ?? null,
      },
      'Mood check-in recorded',
    );
  }

  return { status: 'ok', dateIst, id: row.id, userId: user.id };
}

export interface MoodHistoryEntry {
  date: string;
  mood_value: number;
  id: string;
  /** The word under the face, resolved here so no surface composes one. */
  moodLabel: string | null;
  feeling_words: string[];
  feeling_other: string | null;
  strength_1_5: number | null;
  shared: boolean;
  shareLabel: string;
}

export type MoodHistoryResult =
  | { status: 'ok'; entries: MoodHistoryEntry[] }
  | { status: 'user_not_found' };

/**
 * The client's own check-ins.
 *
 * Unshared rows are included: this is the client reading their own entries, and
 * the share switch on each row needs to know which ones are private. The
 * therapist's read is a different query (the portal's `shared.list`) that puts
 * `shared_with_therapist: true` in its WHERE.
 *
 * Oldest first, because the Progress screen's 14-day chart reads it that way;
 * the check-in list reverses it for display.
 */
export async function getMoodHistory(
  authSubject: string,
  days: number,
): Promise<MoodHistoryResult> {
  const user = await prisma.user.findUnique({
    where: { auth_subject: authSubject },
    select: { id: true },
  });

  if (!user) {
    return { status: 'user_not_found' };
  }

  const today = istDateToUtcMidnight(getISTDateString());
  const start = new Date(today.getTime() - (days - 1) * 86_400_000);

  const entries = await prisma.moodLog.findMany({
    where: {
      user_id: user.id,
      date_ist: { gte: start, lte: today },
    },
    orderBy: { date_ist: 'asc' },
    select: {
      id: true,
      date_ist: true,
      mood_value: true,
      feeling_words: true,
      feeling_other: true,
      strength_1_5: true,
      shared_with_therapist: true,
    },
  });

  return {
    status: 'ok',
    entries: entries.map((e) => ({
      date: e.date_ist.toISOString().split('T')[0],
      mood_value: e.mood_value,
      id: e.id,
      moodLabel: moodLabel(e.mood_value),
      feeling_words: e.feeling_words,
      feeling_other: e.feeling_other,
      strength_1_5: e.strength_1_5,
      shared: e.shared_with_therapist,
      shareLabel: e.shared_with_therapist ? 'Shared with my therapist' : 'Private',
    })),
  };
}
