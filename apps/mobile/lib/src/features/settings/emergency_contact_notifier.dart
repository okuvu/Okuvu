import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';

import '../../core/providers.dart';

class EmergencyContactState {
  final String? name;
  final String? phone;
  final bool isLoading;
  final bool isSaving;
  final String? error;

  const EmergencyContactState({
    this.name,
    this.phone,
    required this.isLoading,
    required this.isSaving,
    this.error,
  });

  const EmergencyContactState.initial()
      : name = null,
        phone = null,
        isLoading = true,
        isSaving = false,
        error = null;

  bool get hasContact => name != null || phone != null;

  EmergencyContactState copyWith({
    String? name,
    String? phone,
    bool? isLoading,
    bool? isSaving,
    String? error,
  }) {
    return EmergencyContactState(
      name: name ?? this.name,
      phone: phone ?? this.phone,
      isLoading: isLoading ?? this.isLoading,
      isSaving: isSaving ?? this.isSaving,
      error: error,
    );
  }
}

class EmergencyContactNotifier extends Notifier<EmergencyContactState> {
  @override
  EmergencyContactState build() {
    Future.microtask(_fetchEmergencyContact);
    return const EmergencyContactState.initial();
  }

  Future<void> _fetchEmergencyContact() async {
    try {
      final dio = ref.read(dioClientProvider);
      final response = await dio.get('/settings/emergency-contact');
      final data = response.data;

      state = state.copyWith(
        name: data['name'] as String?,
        phone: data['phone'] as String?,
        isLoading: false,
        error: null,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: 'Failed to load emergency contact',
      );
    }
  }

  Future<void> saveEmergencyContact(String name, String phone) async {
    state = state.copyWith(isSaving: true, error: null);

    try {
      final dio = ref.read(dioClientProvider);
      await dio.patch(
        '/settings/emergency-contact',
        data: {'name': name, 'phone': phone},
      );

      state = state.copyWith(
        name: name,
        phone: phone,
        isSaving: false,
        error: null,
      );
    } on DioException catch (e) {
      final message = e.response?.data?['error']?['message'] as String? ??
          'Failed to save emergency contact';
      state = state.copyWith(
        isSaving: false,
        error: message,
      );
    } catch (e) {
      state = state.copyWith(
        isSaving: false,
        error: 'Failed to save emergency contact',
      );
    }
  }

  Future<void> clearEmergencyContact() async {
    state = state.copyWith(isSaving: true, error: null);

    try {
      final dio = ref.read(dioClientProvider);
      await dio.patch(
        '/settings/emergency-contact',
        data: {'clear': true},
      );

      state = state.copyWith(
        name: null,
        phone: null,
        isSaving: false,
        error: null,
      );
    } on DioException catch (e) {
      final message = e.response?.data?['error']?['message'] as String? ??
          'Failed to clear emergency contact';
      state = state.copyWith(
        isSaving: false,
        error: message,
      );
    } catch (e) {
      state = state.copyWith(
        isSaving: false,
        error: 'Failed to clear emergency contact',
      );
    }
  }
}

final emergencyContactProvider =
    NotifierProvider<EmergencyContactNotifier, EmergencyContactState>(
  EmergencyContactNotifier.new,
);
