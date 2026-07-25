import 'package:flutter/material.dart';

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
  'anxious': Color(0xFFFEF3E2),
  'sad': Color(0xFFEEF2FF),
  'angry': Color(0xFFFDF2F1),
  'overwhelmed': Color(0xFFFDF2F1),
  'numb': Color(0xFFF4F6F8),
  'calm': Color(0xFFE8F5EE),
  'hopeful': Color(0xFFE8F5EE),
  'other': Color(0xFFF4F6F8),
};
