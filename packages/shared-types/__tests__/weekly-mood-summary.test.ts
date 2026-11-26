/**
 * The weekly mood summary.
 *
 * The owner's rule for every read-back: in words, for the client, no score. So
 * these tests assert both halves — that the week is described in the client's
 * own words, and that nothing numeric or comparative is ever produced.
 */
import { describe, expect, it } from 'vitest';
import { weeklyMoodSummary, WEEKLY_SUMMARY_DAYS, type MoodEntry } from '../mood';

function entry(over: Partial<MoodEntry> = {}): MoodEntry {
  return {
    id: 'e1',
    date: '2026-11-24',
    moodValue: 3,
    moodLabel: 'Okay',
    feelingWords: [],
    feelingOther: null,
    strength: null,
    shared: false,
    ...over,
  };
}

describe('weeklyMoodSummary', () => {
  it('names the empty week instead of returning nothing', () => {
    const summary = weeklyMoodSummary([]);
    expect(summary.recordedDays).toBe(0);
    expect(summary.windowDays).toBe(WEEKLY_SUMMARY_DAYS);
    expect(summary.days).toEqual([]);
    expect(summary.sentences).toEqual([
      'No check-ins in the last 7 days yet. There\'s no wrong time to start.',
    ]);
  });

  it('describes a single day in the client\'s own word', () => {
    const summary = weeklyMoodSummary([entry({ moodLabel: 'Low' })]);
    expect(summary.recordedDays).toBe(1);
    expect(summary.sentences).toContain('You checked in once in the last 7 days.');
    expect(summary.sentences).toContain('That day you picked Low.');
  });

  it('counts days, and reads the week from the first day to the last', () => {
    const summary = weeklyMoodSummary([
      entry({ date: '2026-11-20', moodLabel: 'Awful' }),
      entry({ date: '2026-11-21', moodLabel: 'Low' }),
      entry({ date: '2026-11-24', moodLabel: 'Good' }),
    ]);
    expect(summary.recordedDays).toBe(3);
    expect(summary.sentences).toContain('You checked in on 3 of the last 7 days.');
    expect(summary.sentences).toContain('The week opened at Awful and closed at Good.');
    // Oldest first, whatever order the api returns.
    expect(summary.days.map((d) => d.date)).toEqual(['2026-11-20', '2026-11-21', '2026-11-24']);
  });

  it('says so when the week opened and closed on the same word', () => {
    const summary = weeklyMoodSummary([
      entry({ date: '2026-11-20', moodLabel: 'Okay' }),
      entry({ date: '2026-11-24', moodLabel: 'Okay' }),
    ]);
    expect(summary.sentences).toContain('You started and ended the week at Okay.');
  });

  it('reports the feeling words the client came back to, and only those', () => {
    const summary = weeklyMoodSummary([
      entry({ date: '2026-11-20', feelingWords: ['tired', 'anxious'] }),
      entry({ date: '2026-11-21', feelingWords: ['tired', 'sad'] }),
      entry({ date: '2026-11-22', feelingWords: ['tired'] }),
    ]);
    expect(summary.repeatedFeelings).toEqual(['tired']);
    expect(summary.sentences).toContain('The word you came back to: tired.');
  });

  it('counts a word once per day, however many chips that day had', () => {
    const summary = weeklyMoodSummary([
      entry({ date: '2026-11-20', feelingWords: ['tired', 'tired'] }),
      entry({ date: '2026-11-21', feelingWords: ['sad'] }),
    ]);
    expect(summary.repeatedFeelings).toEqual([]);
  });

  it('lists several repeated words with the most days first', () => {
    const summary = weeklyMoodSummary([
      entry({ date: '2026-11-20', feelingWords: ['sad', 'tired'] }),
      entry({ date: '2026-11-21', feelingWords: ['sad', 'tired'] }),
      entry({ date: '2026-11-22', feelingWords: ['sad'] }),
    ]);
    expect(summary.repeatedFeelings).toEqual(['sad', 'tired']);
    expect(summary.sentences).toContain('The words you came back to: sad and tired.');
  });

  it('never produces a score, an average, a level or a ranking', () => {
    const summary = weeklyMoodSummary([
      entry({ date: '2026-11-20', moodLabel: 'Awful', moodValue: 1, feelingWords: ['sad'] }),
      entry({ date: '2026-11-21', moodLabel: 'Great', moodValue: 5, feelingWords: ['sad'] }),
    ]);
    const text = summary.sentences.join(' ').toLowerCase();
    for (const banned of ['average', 'score', 'level', 'out of', 'rating', 'trend', 'improved', 'worse than', 'better than']) {
      expect(text, banned).not.toContain(banned);
    }
    // And the numbers themselves are never rendered.
    expect(text).not.toMatch(/\d+\.\d/);
  });

  it('drops a row it cannot name rather than inventing a word for it', () => {
    const summary = weeklyMoodSummary([
      entry({ date: '2026-11-20', moodLabel: 'Okay' }),
      // A stored value outside 1-5 has no face, so no word. It must not become
      // "Unknown" or an empty label in the client's summary.
      entry({ date: '2026-11-21', moodLabel: null as unknown as string }),
    ]);
    expect(summary.recordedDays).toBe(1);
    expect(summary.days).toHaveLength(1);
  });
});
