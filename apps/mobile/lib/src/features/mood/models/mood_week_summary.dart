import '../mood_vocabulary.dart';
import 'mood_entry.dart';

/// The numbers behind "Your week".
///
/// This card is the client's alone: the therapist portal never renders it. It is
/// counts and words and nothing else — no score, no trend, no advice, and no
/// comparison with a previous week. The sentence is built from the counts, in
/// plain words, exactly as the owner asked for it.
class MoodWeekSummary {
  const MoodWeekSummary({
    required this.faceCounts,
    required this.topWords,
    required this.total,
  });

  /// How many times each face was chosen, 1-5, in the window.
  final Map<int, int> faceCounts;

  /// At most three words, most-chosen first; ties keep the vocabulary order.
  final List<String> topWords;

  /// How many check-ins the counts are built from.
  final int total;

  static const int windowDays = 7;

  /// The client's IST calendar day, `YYYY-MM-DD`.
  ///
  /// Built by hand rather than with `toLocal()`: the app's day boundary is IST
  /// everywhere else (the check-in is stamped by the api on the same day), and a
  /// handset set to another timezone must not shift which check-ins count.
  static String istToday([DateTime? now]) {
    final ist = (now ?? DateTime.now())
        .toUtc()
        .add(const Duration(hours: 5, minutes: 30));
    final month = ist.month.toString().padLeft(2, '0');
    final day = ist.day.toString().padLeft(2, '0');
    return '${ist.year.toString().padLeft(4, '0')}-$month-$day';
  }

  factory MoodWeekSummary.from(
    List<MoodEntry> entries, {
    DateTime? now,
  }) {
    final today = _parse(istToday(now));
    final faceCounts = <int, int>{for (final face in kMoodFaces) face.value: 0};
    final wordCounts = <String, int>{};

    var total = 0;
    if (today != null) {
      final start = today.subtract(
        const Duration(days: windowDays - 1),
      );
      for (final entry in entries) {
        final at = _parse(entry.date);
        if (at == null || at.isBefore(start) || at.isAfter(today)) continue;
        total += 1;
        faceCounts[entry.moodValue] = (faceCounts[entry.moodValue] ?? 0) + 1;
        for (final word in entry.words) {
          // Only the vocabulary is counted, so a typed "Something else" never
          // becomes a word in the client's own summary sentence.
          if (!kFeelingWords.contains(word)) continue;
          wordCounts[word] = (wordCounts[word] ?? 0) + 1;
        }
      }
    }

    final ranked = wordCounts.entries.toList()
      ..sort((a, b) {
        final byCount = b.value.compareTo(a.value);
        if (byCount != 0) return byCount;
        return kFeelingWords.indexOf(a.key).compareTo(kFeelingWords.indexOf(b.key));
      });

    return MoodWeekSummary(
      faceCounts: faceCounts,
      topWords: ranked.take(3).map((e) => e.key).toList(growable: false),
      total: total,
    );
  }

  /// The one line at the top of the card. Plain words, no judgement.
  String get sentence {
    if (total == 0) return 'No check-ins this week yet.';
    if (topWords.isEmpty) return 'No feeling words this week.';
    if (topWords.length == 1) {
      return 'This week you felt ${topWords[0]} most often.';
    }
    if (topWords.length == 2) {
      return 'This week you felt ${topWords[0]} and ${topWords[1]} most often.';
    }
    return 'This week you felt ${topWords[0]}, ${topWords[1]} and ${topWords[2]} most often.';
  }

  static DateTime? _parse(String? value) {
    if (value == null || value.length < 10) return null;
    final date = DateTime.tryParse('${value.substring(0, 10)}T00:00:00.000Z');
    if (date == null) return null;
    return DateTime.utc(date.year, date.month, date.day);
  }
}
