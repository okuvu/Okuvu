/// The week's check-ins, written back in the client's own words.
///
/// The api composes the sentences (`weeklyMoodSummary` in
/// `packages/shared-types/mood.ts`); this file only reads them. Nothing is
/// counted, averaged, ranked or charted here: the payload's own fields are days,
/// the words the client picked, and sentences. A day whose label is missing is
/// dropped rather than given a placeholder word, because repeating the client's
/// words is the whole promise of the screen.
class WeeklyMoodDay {
  const WeeklyMoodDay({
    required this.date,
    required this.moodLabel,
    required this.feelingWords,
  });

  /// `YYYY-MM-DD`, IST, as the api sends it.
  final String date;

  /// The word under the face they picked, verbatim.
  final String moodLabel;

  /// The chips they chose that day, verbatim.
  final List<String> feelingWords;

  static WeeklyMoodDay? tryParse(Object? raw) {
    if (raw is! Map) return null;
    final date = raw['date'];
    final moodLabel = raw['moodLabel'];
    if (date is! String || date.isEmpty || moodLabel is! String || moodLabel.isEmpty) {
      return null;
    }
    final words = raw['feelingWords'];
    return WeeklyMoodDay(
      date: date,
      moodLabel: moodLabel,
      feelingWords: words is List ? words.whereType<String>().toList() : const [],
    );
  }

  /// "24 Nov" — the day written out, for the list under the summary.
  String get dayLabel {
    final parsed = DateTime.tryParse(date);
    if (parsed == null) return date;
    return '${parsed.day} ${_months[parsed.month - 1]}';
  }

  static const _months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
}

class WeeklyMoodSummary {
  const WeeklyMoodSummary({
    required this.recordedDays,
    required this.windowDays,
    required this.days,
    required this.repeatedFeelings,
    required this.sentences,
  });

  final int recordedDays;
  final int windowDays;
  final List<WeeklyMoodDay> days;
  final List<String> repeatedFeelings;

  /// The summary itself. These are the words the screen shows.
  final List<String> sentences;

  factory WeeklyMoodSummary.fromJson(Map<String, dynamic> json) {
    final rawDays = json['days'];
    final days = rawDays is List
        ? rawDays.map(WeeklyMoodDay.tryParse).whereType<WeeklyMoodDay>().toList()
        : <WeeklyMoodDay>[];
    final rawSentences = json['sentences'];
    final rawRepeated = json['repeatedFeelings'];
    final recordedDays = json['recordedDays'];

    return WeeklyMoodSummary(
      recordedDays: recordedDays is int ? recordedDays : days.length,
      windowDays: json['windowDays'] is int ? json['windowDays'] as int : 7,
      days: days,
      repeatedFeelings:
          rawRepeated is List ? rawRepeated.whereType<String>().toList() : const [],
      sentences:
          rawSentences is List ? rawSentences.whereType<String>().toList() : const [],
    );
  }
}
