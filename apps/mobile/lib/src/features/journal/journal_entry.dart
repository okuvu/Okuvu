import 'package:flutter/material.dart';
import '../../theme/app_colors.dart';

class JournalEntry {
  final String id;

  /// Null when the entry was written without picking a mood chip. The mood is
  /// optional: the words are the point of the journal, the label is a helper.
  final String? emotion;
  final int? intensity;
  final String content;
  final DateTime createdAt;

  /// Whether this one entry is shared with the client's therapist. False is
  /// the default and the only state a new entry can start in.
  final bool shared;

  const JournalEntry({
    required this.id,
    this.emotion,
    this.intensity,
    required this.content,
    required this.createdAt,
    this.shared = false,
  });

  factory JournalEntry.fromJson(Map<String, dynamic> json) {
    return JournalEntry(
      id: json['id'] as String,
      // Absent or null both mean "no mood recorded" — older rows always carry
      // one, newer rows may not, and the history list has to render both.
      emotion: json['emotion'] as String?,
      intensity: json['intensity'] as int?,
      content: json['content'] as String,
      createdAt: DateTime.parse(json['created_at'] as String),
      shared: json['shared'] as bool? ?? false,
    );
  }
}

const List<String> journalEmotions = [
  'anxious',
  'sad',
  'angry',
  'overwhelmed',
  'numb',
  'calm',
  'hopeful',
  'other',
];

const Map<String, String> journalEmotionLabels = {
  'anxious': 'Anxious',
  'sad': 'Sad',
  'angry': 'Angry',
  'overwhelmed': 'Overwhelmed',
  'numb': 'Numb',
  'calm': 'Calm',
  'hopeful': 'Hopeful',
  'other': 'Other',
};

const Map<String, Color> emotionColors = {
  'anxious': AppColors.honeyTint,
  'sad': AppColors.lavenderTint,
  'angry': AppColors.crisisTint,
  'overwhelmed': AppColors.crisisTint,
  'numb': AppColors.lavenderWash,
  'calm': AppColors.sageTint,
  'hopeful': AppColors.sageTint,
  'other': AppColors.lavenderWash,
};
