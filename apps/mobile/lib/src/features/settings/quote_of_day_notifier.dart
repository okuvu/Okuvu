import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:async';

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

  Future<void> setEnabled(bool newValue) async {
    state = state.copyWith(
      enabled: newValue,
      error: null,
    );

    final dio = ref.read(dioClientProvider);

    unawaited(_persistEnabled(dio, newValue));
  }

  Future<void> _persistEnabled(Dio dio, bool newValue) async {
    try {
      await dio.patch(
        '/settings/quote-of-day',
        data: {
          'enabled': newValue,
        },
      );
    } on DioException catch (e) {
      Logger.debug('Quote-of-day preference persistence failed: ${e.response?.statusCode}');
    } catch (e) {
      Logger.debug('Quote-of-day preference persistence failed: $e');
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
