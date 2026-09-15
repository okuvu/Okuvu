import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/logger.dart';
import '../../core/providers.dart';

/// Settings > Notifications — inert preference toggles (no push/FCM
/// delivery exists yet). Mirrors QuoteOfDaySettingsNotifier's shape:
/// optimistic local update, fire-and-forget persist.
class NotificationSettingsState {
  final bool appointmentRemindersEnabled;
  final bool chatNudgesEnabled;
  final bool isLoading;

  const NotificationSettingsState({
    required this.appointmentRemindersEnabled,
    required this.chatNudgesEnabled,
    required this.isLoading,
  });

  const NotificationSettingsState.initial()
      : appointmentRemindersEnabled = true,
        chatNudgesEnabled = true,
        isLoading = true;

  NotificationSettingsState copyWith({
    bool? appointmentRemindersEnabled,
    bool? chatNudgesEnabled,
    bool? isLoading,
  }) {
    return NotificationSettingsState(
      appointmentRemindersEnabled:
          appointmentRemindersEnabled ?? this.appointmentRemindersEnabled,
      chatNudgesEnabled: chatNudgesEnabled ?? this.chatNudgesEnabled,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

class NotificationSettingsNotifier extends Notifier<NotificationSettingsState> {
  @override
  NotificationSettingsState build() {
    Future.microtask(_fetch);
    return const NotificationSettingsState.initial();
  }

  Future<void> _fetch() async {
    try {
      final dio = ref.read(dioClientProvider);
      final response = await dio.get('/settings/notifications');
      state = state.copyWith(
        appointmentRemindersEnabled:
            response.data['appointment_reminders_enabled'] as bool? ?? true,
        chatNudgesEnabled: response.data['chat_nudges_enabled'] as bool? ?? true,
        isLoading: false,
      );
    } catch (_) {
      state = state.copyWith(isLoading: false);
    }
  }

  Future<void> setAppointmentReminders(bool value) async {
    state = state.copyWith(appointmentRemindersEnabled: value);
    unawaited(_persist({'appointment_reminders_enabled': value}));
  }

  Future<void> setChatNudges(bool value) async {
    state = state.copyWith(chatNudgesEnabled: value);
    unawaited(_persist({'chat_nudges_enabled': value}));
  }

  Future<void> _persist(Map<String, dynamic> data) async {
    try {
      final dio = ref.read(dioClientProvider);
      await dio.patch('/settings/notifications', data: data);
    } on DioException catch (e) {
      Logger.debug('Notification preference persistence failed: ${e.response?.statusCode}');
    } catch (e) {
      Logger.debug('Notification preference persistence failed: $e');
    }
  }
}

final notificationSettingsProvider =
    NotifierProvider<NotificationSettingsNotifier, NotificationSettingsState>(
  NotificationSettingsNotifier.new,
);
