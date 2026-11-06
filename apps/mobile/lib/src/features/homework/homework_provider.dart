import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

/// One assignment from `GET /users/me/homework`.
///
/// Why this route exists at all: Home's Today card serves a single active
/// assignment (the newest), so three things assigned in a week meant the client
/// saw one. This list is every assignment, and it is where a "New homework"
/// notification opens.
class HomeworkListItem {
  final String id;
  final String description;
  final String status;
  final String? toolId;
  final String? toolLabel;
  final DateTime assignedAt;

  const HomeworkListItem({
    required this.id,
    required this.description,
    required this.status,
    this.toolId,
    this.toolLabel,
    required this.assignedAt,
  });

  bool get isActive => status == 'active';

  factory HomeworkListItem.fromJson(Map<String, dynamic> json) {
    return HomeworkListItem(
      id: json['id'] as String,
      description: json['description'] as String,
      status: json['status'] as String,
      toolId: json['toolId'] as String?,
      toolLabel: json['toolLabel'] as String?,
      assignedAt: DateTime.parse(json['assignedAt'] as String),
    );
  }
}

class HomeworkReminderItem {
  final String id;
  final String scheduleNote;
  final String frequency;
  final List<String> times;
  final String? homeworkId;
  final String? toolLabel;

  const HomeworkReminderItem({
    required this.id,
    required this.scheduleNote,
    required this.frequency,
    required this.times,
    this.homeworkId,
    this.toolLabel,
  });

  factory HomeworkReminderItem.fromJson(Map<String, dynamic> json) {
    final rawTimes = json['times'] as List<dynamic>? ?? [];
    return HomeworkReminderItem(
      id: json['id'] as String,
      scheduleNote: json['scheduleNote'] as String,
      frequency: json['frequency'] as String? ?? 'off',
      times: rawTimes.map((t) => t as String).toList(),
      homeworkId: json['homeworkId'] as String?,
      toolLabel: json['toolLabel'] as String?,
    );
  }
}

class HomeworkListPage {
  final List<HomeworkListItem> homework;
  final List<HomeworkReminderItem> reminders;

  const HomeworkListPage({required this.homework, required this.reminders});

  factory HomeworkListPage.fromJson(Map<String, dynamic> json) {
    final rawHomework = json['homework'] as List<dynamic>? ?? [];
    final rawReminders = json['reminders'] as List<dynamic>? ?? [];
    return HomeworkListPage(
      homework: rawHomework
          .map((h) => HomeworkListItem.fromJson(h as Map<String, dynamic>))
          .toList(),
      reminders: rawReminders
          .map((r) => HomeworkReminderItem.fromJson(r as Map<String, dynamic>))
          .toList(),
    );
  }
}

final homeworkListProvider =
    FutureProvider.autoDispose<HomeworkListPage>((ref) async {
  final dio = ref.read(dioClientProvider);
  final response = await dio.get('/users/me/homework');
  return HomeworkListPage.fromJson(response.data as Map<String, dynamic>);
});

/// Mirrors `describeReminderSchedule` in `packages/shared-types/notifications.ts`
/// — the reminder text the inbox shows and the text this screen shows must say
/// the same thing about the same row, so keep the two in step when either
/// changes. Times are stored as the client's own wall clock ("HH:mm"), not UTC.
String describeReminderSchedule(String frequency, List<String> times) {
  String formatTime(String raw) {
    final parts = raw.split(':');
    final hour = int.tryParse(parts.isNotEmpty ? parts[0] : '');
    if (hour == null) return raw;
    final minute = parts.length > 1 ? parts[1].padLeft(2, '0') : '00';
    final suffix = hour < 12 ? 'am' : 'pm';
    final hour12 = hour % 12 == 0 ? 12 : hour % 12;
    return '$hour12:$minute $suffix';
  }

  final formatted = times.map(formatTime).toList();

  switch (frequency) {
    case 'once_daily':
      return formatted.isNotEmpty ? 'Once a day at ${formatted.first}' : 'Once a day';
    case 'twice_daily':
      return formatted.isNotEmpty
          ? 'Twice a day (${formatted.join(', ')})'
          : 'Twice a day';
    case 'thrice_daily':
      return formatted.isNotEmpty
          ? 'Three times a day (${formatted.join(', ')})'
          : 'Three times a day';
    case 'as_needed':
      return 'Whenever you need it';
    case 'off':
    default:
      return 'No set time';
  }
}
