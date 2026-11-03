import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/logger.dart';
import '../../core/providers.dart';

class VoiceSettingsState {
  final bool voiceEnabled;
  final bool isLoading;
  final String? error;

  const VoiceSettingsState({
    required this.voiceEnabled,
    required this.isLoading,
    this.error,
  });

  const VoiceSettingsState.initial()
      : voiceEnabled = false,
        isLoading = true,
        error = null;

  VoiceSettingsState copyWith({
    bool? voiceEnabled,
    bool? isLoading,
    String? error,
  }) {
    return VoiceSettingsState(
      voiceEnabled: voiceEnabled ?? this.voiceEnabled,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class VoiceSettingsNotifier extends Notifier<VoiceSettingsState> {
  @override
  VoiceSettingsState build() {
    Future.microtask(_fetchVoicePreference);
    return const VoiceSettingsState.initial();
  }

  Future<void> _fetchVoicePreference() async {
    try {
      final dio = ref.read(dioClientProvider);

      final response = await dio.get('/settings/voice');

      final voiceEnabled = response.data['voice_enabled'] as bool? ?? false;

      state = state.copyWith(
        voiceEnabled: voiceEnabled,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
      );
    }
  }

  /// Saves the new value and returns whether the server accepted it. On
  /// failure the switch is put back where it was, so the screen never claims a
  /// preference that was not stored (round 8: the owner's "nothing in Settings
  /// saves" was partly a screen that kept showing a value the API had rejected).
  Future<bool> toggleVoice(bool newValue) async {
    final previous = state.voiceEnabled;

    state = state.copyWith(
      voiceEnabled: newValue,
      error: null,
    );

    try {
      final dio = ref.read(dioClientProvider);
      await dio.patch(
        '/settings/voice',
        data: {
          'voice_enabled': newValue,
        },
      );
      return true;
    } catch (e) {
      state = state.copyWith(voiceEnabled: previous);
      Logger.debug('Voice preference persistence failed: $e');
      return false;
    }
  }
}

final voiceSettingsProvider =
    NotifierProvider<VoiceSettingsNotifier, VoiceSettingsState>(
  VoiceSettingsNotifier.new,
);

final voiceSettingsStateProvider = Provider<VoiceSettingsState>((ref) {
  return ref.watch(voiceSettingsProvider);
});
