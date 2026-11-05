import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/logger.dart';
import '../../core/providers.dart';

/// okuvu-remaining-changes.md O6 — care-plan-aware quote of the day,
/// opt-in. Mirrors VoiceSettingsState's shape/pattern exactly.
class QuoteOfDaySettingsState {
  final bool enabled;
  final bool isLoading;
  final String? error;

  const QuoteOfDaySettingsState({
    required this.enabled,
    required this.isLoading,
    this.error,
  });

  const QuoteOfDaySettingsState.initial()
      : enabled = false,
        isLoading = true,
        error = null;

  QuoteOfDaySettingsState copyWith({
    bool? enabled,
    bool? isLoading,
    String? error,
  }) {
    return QuoteOfDaySettingsState(
      enabled: enabled ?? this.enabled,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class QuoteOfDaySettingsNotifier extends Notifier<QuoteOfDaySettingsState> {
  @override
  QuoteOfDaySettingsState build() {
    Future.microtask(_fetchEnabled);
    return const QuoteOfDaySettingsState.initial();
  }

  Future<void> _fetchEnabled() async {
    try {
      final dio = ref.read(dioClientProvider);

      final response = await dio.get('/settings/quote-of-day');

      final enabled = response.data['enabled'] as bool? ?? false;

      state = state.copyWith(
        enabled: enabled,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
      );
    }
  }

  /// Returns whether the server accepted the change; reverts on failure. See
  /// VoiceSettingsNotifier.toggleVoice for why the write is no longer
  /// fire-and-forget.
  Future<bool> setEnabled(bool newValue) async {
    final previous = state.enabled;

    state = state.copyWith(
      enabled: newValue,
      error: null,
    );

    try {
      final dio = ref.read(dioClientProvider);
      await dio.patch(
        '/settings/quote-of-day',
        data: {
          'enabled': newValue,
        },
      );
      return true;
    } catch (e) {
      state = state.copyWith(enabled: previous);
      Logger.debug('Quote-of-day preference persistence failed: $e');
      return false;
    }
  }
}

final quoteOfDaySettingsProvider =
    NotifierProvider<QuoteOfDaySettingsNotifier, QuoteOfDaySettingsState>(
  QuoteOfDaySettingsNotifier.new,
);

final quoteOfDaySettingsStateProvider = Provider<QuoteOfDaySettingsState>((ref) {
  return ref.watch(quoteOfDaySettingsProvider);
});
