import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/features/mood/models/mood_entry.dart';
import 'package:okuvu/src/features/mood/models/mood_week_summary.dart';

/// The numbers behind "Your week". Pure logic, so it is tested without a widget
/// tree: the seven-day window, the counts per face, and the three words.
MoodEntry entry({
  required String date,
  int mood = 3,
  List<String> words = const [],
  String? other,
}) =>
    MoodEntry(
      id: date,
      date: date,
      moodValue: mood,
      label: null,
      words: words,
      other: other,
      strength: null,
      shared: false,
    );

void main() {
  // A fixed "now" so the window arithmetic is not a function of the day the
  // suite happens to run. 12:00 UTC is 17:30 IST on the same day.
  final now = DateTime.utc(2026, 11, 22, 12);

  test('counts each face and keeps only the last seven days', () {
    final summary = MoodWeekSummary.from([
      entry(date: '2026-11-22', mood: 4),
      entry(date: '2026-11-21', mood: 4),
      entry(date: '2026-11-20', mood: 2),
      entry(date: '2026-11-16', mood: 1), // still day -6, inside the window
      entry(date: '2026-11-15', mood: 5), // day -7, outside
    ], now: now);

    expect(summary.total, 4);
    expect(summary.faceCounts[4], 2);
    expect(summary.faceCounts[2], 1);
    expect(summary.faceCounts[1], 1);
    expect(summary.faceCounts[5], 0);
  });

  test('names the three most-chosen words, breaking ties by the word list order', () {
    final summary = MoodWeekSummary.from([
      entry(date: '2026-11-22', words: ['tired', 'calm']),
      entry(date: '2026-11-21', words: ['tired', 'sad']),
      entry(date: '2026-11-20', words: ['calm', 'anxious']),
    ], now: now);

    // tired and calm tie at two; the word-list order breaks the tie. sad and
    // anxious tie at one, and anxious comes first in the owner's list.
    expect(summary.topWords, ['tired', 'calm', 'anxious']);
    expect(summary.sentence, 'This week you felt tired, calm and anxious most often.');
  });

  test('speaks plainly for one and two words', () {
    expect(
      MoodWeekSummary.from([entry(date: '2026-11-22', words: ['sad'])], now: now).sentence,
      'This week you felt sad most often.',
    );
    expect(
      MoodWeekSummary.from([
        entry(date: '2026-11-22', words: ['sad', 'calm']),
      ], now: now).sentence,
      'This week you felt sad and calm most often.',
    );
  });

  test('a week with no check-ins says so, without advice', () {
    expect(
      MoodWeekSummary.from(const [], now: now).sentence,
      'No check-ins this week yet.',
    );
    expect(
      MoodWeekSummary.from([entry(date: '2026-11-22')], now: now).sentence,
      'No feeling words this week.',
    );
  });

  test('a typed "Something else" is not counted as a word', () {
    final summary = MoodWeekSummary.from([
      entry(date: '2026-11-22', words: ['tired'], other: 'worn thin'),
    ], now: now);

    expect(summary.topWords, ['tired']);
    expect(summary.sentence, 'This week you felt tired most often.');
  });

  test('the IST day is used, so a late-evening check-in counts as today', () {
    // 19:00 UTC is 00:30 IST the next day.
    expect(
      MoodWeekSummary.istToday(DateTime.utc(2026, 11, 22, 19)),
      '2026-11-23',
    );
    expect(
      MoodWeekSummary.istToday(DateTime.utc(2026, 11, 22, 12)),
      '2026-11-22',
    );
  });
}
