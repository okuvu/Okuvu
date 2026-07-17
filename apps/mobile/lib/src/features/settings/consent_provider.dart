import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import '../../core/providers.dart';

class ConsentState {
  final bool safetyMonitoring;
  final bool moodInference;
  final bool assessment;
  final bool emergencyContact;
  final bool isLoading;
  final bool isSaving;
  final String? error;

  const ConsentState({
    required this.safetyMonitoring,
    required this.moodInference,
    required this.assessment,
    required this.emergencyContact,
    required this.isLoading,
    required this.isSaving,
    this.error,
  });

  const ConsentState.initial()
      : safetyMonitoring = true,
        moodInference = false,
        assessment = false,
        emergencyContact = false,
        isLoading = true,
        isSaving = false,
        error = null;

  ConsentState copyWith({
    bool? safetyMonitoring,
    bool? moodInference,
    bool? assessment,
    bool? emergencyContact,
    bool? isLoading,
    bool? isSaving,
    String? error,
  }) {
    return ConsentState(
      safetyMonitoring: safetyMonitoring ?? this.safetyMonitoring,
      moodInference: moodInference ?? this.moodInference,
      assessment: assessment ?? this.assessment,
      emergencyContact: emergencyContact ?? this.emergencyContact,
      isLoading: isLoading ?? this.isLoading,
      isSaving: isSaving ?? this.isSaving,
      error: error,
    );
  }
}

class ConsentNotifier extends Notifier<ConsentState> {
  ConsentState? _savedState;

  bool get hasChanges {
    if (_savedState == null) return false;
    return _savedState!.moodInference != state.moodInference ||
        _savedState!.assessment != state.assessment ||
        _savedState!.emergencyContact != state.emergencyContact;
  }

  @override
  ConsentState build() {
    Future.microtask(_fetchConsent);
    return const ConsentState.initial();
  }

  Future<void> _fetchConsent() async {
    try {
      final dio = ref.read(dioClientProvider);
      final response = await dio.get('/users/me/context');
      final engagement = response.data['engagement'] as Map<String, dynamic>?;

      final fetched = ConsentState(
        safetyMonitoring: (engagement?['consent_1'] as bool?) ?? true,
        moodInference: (engagement?['consent_2'] as bool?) ?? false,
        assessment: (engagement?['consent_3'] as bool?) ?? false,
        emergencyContact: (engagement?['consent_4'] as bool?) ?? false,
        isLoading: false,
        isSaving: false,
      );
      _savedState = fetched;
      state = fetched;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: 'Failed to load consent preferences',
      );
    }
  }

  void setMoodInference(bool value) {
    state = state.copyWith(moodInference: value);
  }

  void setAssessment(bool value) {
    state = state.copyWith(assessment: value);
  }

  void setEmergencyContact(bool value) {
    state = state.copyWith(emergencyContact: value);
  }

  Future<void> save() async {
    state = state.copyWith(isSaving: true, error: null);

    try {
      final dio = ref.read(dioClientProvider);
      await dio.post(
        '/users/me/consent',
        data: {
          'safety_monitoring': state.safetyMonitoring,
          'mood_inference': state.moodInference,
          'assessment': state.assessment,
          'emergency_contact': state.emergencyContact,
        },
      );

      _savedState = state;
      state = state.copyWith(isSaving: false);
    } on DioException catch (e) {
      final message = e.response?.data?['error']?['message'] as String? ??
          'Failed to save consent preferences';
      state = state.copyWith(
        isSaving: false,
        error: message,
      );
    } catch (e) {
      state = state.copyWith(
        isSaving: false,
        error: 'Failed to save consent preferences',
      );
    }
  }
}

final consentProvider =
    NotifierProvider<ConsentNotifier, ConsentState>(ConsentNotifier.new);
