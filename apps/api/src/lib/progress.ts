import { prisma } from './prisma.js';
import { getISTDateString } from '@okuvu/shared-types';

export type LogFn = (obj: Record<string, unknown>, msg: string) => void;

export type MoodCheckinResult =
  | { status: 'ok'; dateIst: string }
  | { status: 'user_not_found' };

export async function recordMoodCheckin(
  authSubject: string,
  moodValue: number,
  log?: { info: LogFn },
): Promise<MoodCheckinResult> {
  const user = await prisma.user.findUnique({
    where: { auth_subject: authSubject },
    select: { id: true },
  });

  if (!user) {
    return { status: 'user_not_found' };
  }

  const dateIst = getISTDateString();

  await prisma.moodLog.upsert({
    where: {
      user_id_date_ist: {
        user_id: user.id,
        date_ist: dateIst,
      },
    },
    create: {
      user_id: user.id,
      mood_value: moodValue,
      date_ist: dateIst,
      source: 'user_input',
    },
    update: {
      mood_value: moodValue,
      source: 'user_input',
    },
  });

  if (log) {
    log.info(
      { event: 'mood_checkin', user_id: user.id, date: dateIst, mood_value: moodValue },
      'Mood check-in recorded',
    );
  }

  return { status: 'ok', dateIst };
}

export interface MoodHistoryEntry {
  date: string;
  mood_value: number;
}

export type MoodHistoryResult =
  | { status: 'ok'; entries: MoodHistoryEntry[] }
  | { status: 'user_not_found' };

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

  const todayStr = getISTDateString();
  const today = new Date(todayStr + 'T00:00:00.000Z');
  const start = new Date(today.getTime() - (days - 1) * 86_400_000);

  const entries = await prisma.moodLog.findMany({
    where: {
      user_id: user.id,
      date_ist: { gte: start, lte: today },
    },
    orderBy: { date_ist: 'asc' },
    select: {
      date_ist: true,
      mood_value: true,
    },
  });

  return {
    status: 'ok',
    entries: entries.map((e) => ({
      date: e.date_ist.toISOString().split('T')[0],
      mood_value: e.mood_value,
    })),
  };
}
