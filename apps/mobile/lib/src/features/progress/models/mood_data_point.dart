class MoodDataPoint {
  const MoodDataPoint({
    required this.date,
    required this.mood,
  });

  final DateTime date;
  final int? mood;

  factory MoodDataPoint.fromJson(Map<String, dynamic> json) {
    return MoodDataPoint(
      date: DateTime.parse(json['date'] as String).toLocal(),
      mood: json['mood'] as int?,
    );
  }
}