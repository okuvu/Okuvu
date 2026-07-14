import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';

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

      final voiceEnabled =
          response.data['voice_enabled'] as bool? ?? false;

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

  Future<void> toggleVoice(bool newValue) async {
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
    } on DioException catch (e) {
      debugPrint(
        'Voice preference persistence failed: ${e.response?.statusCode}',
      );
    } catch (e) {
      debugPrint('Voice preference persistence failed: $e');
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