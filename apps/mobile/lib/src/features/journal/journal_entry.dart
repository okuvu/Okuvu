import 'package:flutter/material.dart';
import '../../theme/app_colors.dart';

class JournalEntry {
  final String id;
  final String emotion;
  final int intensity;
  final String content;
  final DateTime createdAt;

  const JournalEntry({
    required this.id,
    required this.emotion,
    required this.intensity,
    required this.content,
    required this.createdAt,
  });

  factory JournalEntry.fromJson(Map<String, dynamic> json) {
    return JournalEntry(
      id: json['id'] as String,
      emotion: json['emotion'] as String,
      intensity: json['intensity'] as int,
      content: json['content'] as String,
      createdAt: DateTime.parse(json['created_at'] as String),
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
