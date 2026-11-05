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

  Future<bool> setAppointmentReminders(bool value) async {
    return _set(
      apply: () => state = state.copyWith(appointmentRemindersEnabled: value),
      revert: (previous) =>
          state = state.copyWith(appointmentRemindersEnabled: previous),
      previous: state.appointmentRemindersEnabled,
      payload: {'appointment_reminders_enabled': value},
    );
  }

  Future<bool> setChatNudges(bool value) async {
    return _set(
      apply: () => state = state.copyWith(chatNudgesEnabled: value),
      revert: (previous) => state = state.copyWith(chatNudgesEnabled: previous),
      previous: state.chatNudgesEnabled,
      payload: {'chat_nudges_enabled': value},
    );
  }

  /// Awaitable, reverting write shared by both toggles. Fire-and-forget made a
  /// rejected save indistinguishable from a stored one (round 8).
  Future<bool> _set({
    required void Function() apply,
    required void Function(bool previous) revert,
    required bool previous,
    required Map<String, dynamic> payload,
  }) async {
    apply();
    try {
      final dio = ref.read(dioClientProvider);
      await dio.patch('/settings/notifications', data: payload);
      return true;
    } catch (e) {
      revert(previous);
      Logger.debug('Notification preference persistence failed: $e');
      return false;
    }
  }
}

final notificationSettingsProvider =
    NotifierProvider<NotificationSettingsNotifier, NotificationSettingsState>(
  NotificationSettingsNotifier.new,
);
