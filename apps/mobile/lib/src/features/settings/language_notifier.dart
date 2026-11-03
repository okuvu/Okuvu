import 'package:flutter_riverpod/flutter_riverpod.dart';

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

  /// Returns whether the server accepted the change; reverts on failure so a
  /// language that was not stored is never shown as selected.
  Future<bool> setLanguageMode(String newValue) async {
    final previous = state.languageMode;

    state = state.copyWith(
      languageMode: newValue,
      error: null,
    );

    try {
      final dio = ref.read(dioClientProvider);
      await dio.patch(
        '/settings/language',
        data: {
          'language_mode': newValue,
        },
      );
      return true;
    } catch (e) {
      state = state.copyWith(languageMode: previous);
      Logger.debug('Language mode persistence failed: $e');
      return false;
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
