import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:async';

import '../../core/logger.dart';
import '../../core/providers.dart';

/// OKUVU v2.0: english | mirror (adaptive Hinglish) — drives A2's/A9-post's
/// ${language_mode}. Mirrors VoiceSettingsState's shape/pattern exactly.
class LanguageSettingsState {
  final String languageMode;
  final bool isLoading;
  final String? error;

  const LanguageSettingsState({
    required this.languageMode,
    required this.isLoading,
    this.error,
  });

  const LanguageSettingsState.initial()
      : languageMode = 'english',
        isLoading = true,
        error = null;

  LanguageSettingsState copyWith({
    String? languageMode,
    bool? isLoading,
    String? error,
  }) {
    return LanguageSettingsState(
      languageMode: languageMode ?? this.languageMode,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class LanguageSettingsNotifier extends Notifier<LanguageSettingsState> {
  @override
  LanguageSettingsState build() {
    Future.microtask(_fetchLanguageMode);
    return const LanguageSettingsState.initial();
  }

  Future<void> _fetchLanguageMode() async {
    try {
      final dio = ref.read(dioClientProvider);

      final response = await dio.get('/settings/language');

      final languageMode = response.data['language_mode'] as String? ?? 'english';

      state = state.copyWith(
        languageMode: languageMode,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
      );
    }
  }

  Future<void> setLanguageMode(String newValue) async {
    state = state.copyWith(
      languageMode: newValue,
      error: null,
    );

    final dio = ref.read(dioClientProvider);

    unawaited(_persistLanguageMode(dio, newValue));
  }

  Future<void> _persistLanguageMode(Dio dio, String newValue) async {
    try {
      await dio.patch(
        '/settings/language',
        data: {
          'language_mode': newValue,
        },
      );
    } on DioException catch (e) {
      Logger.debug('Language mode persistence failed: ${e.response?.statusCode}');
    } catch (e) {
      Logger.debug('Language mode persistence failed: $e');
    }
  }
}

final languageSettingsProvider =
    NotifierProvider<LanguageSettingsNotifier, LanguageSettingsState>(
  LanguageSettingsNotifier.new,
);

final languageSettingsStateProvider = Provider<LanguageSettingsState>((ref) {
  return ref.watch(languageSettingsProvider);
});
