/// One saved mood check-in, as the client's own list reads it.
///
/// The words come back in the order the api stored them; the label under the
/// face is resolved by the server (`moodLabel`), so the app never composes one.
class MoodEntry {
  const MoodEntry({
    required this.id,
    required this.date,
    required this.moodValue,
    required this.label,
    required this.words,
    required this.other,
    required this.strength,
    required this.shared,
  });

  final String id;

  /// The client's IST calendar day, `YYYY-MM-DD`.
  final String date;

  /// 1-5. Unchanged since the first check-in: 1 = Awful … 5 = Great.
  final int moodValue;

  /// The word under the face, from the server.
  final String? label;

  /// The chips the client chose (at most three).
  final List<String> words;

  /// "Something else", when the client wrote one.
  final String? other;

  /// 1-5, or null when the slider was left alone.
  final int? strength;

  /// Private by default. Only this client's own switch changes it.
  final bool shared;

  factory MoodEntry.fromJson(Map<String, dynamic> json) {
    final rawWords = json['feeling_words'];
    return MoodEntry(
      id: json['id'] as String? ?? '',
      date: json['date'] as String? ?? '',
      moodValue: json['mood_value'] as int? ?? 0,
      label: json['moodLabel'] as String?,
      words: rawWords is List
          ? rawWords.whereType<String>().toList(growable: false)
          : const [],
      other: json['feeling_other'] as String?,
      strength: json['strength_1_5'] as int?,
      shared: json['shared'] as bool? ?? false,
    );
  }

  /// Every word this entry carries, chips first then "Something else".
  List<String> get allWords =>
      other == null || other!.isEmpty ? words : [...words, other!];
}
