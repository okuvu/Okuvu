import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../config/app_config.dart';
import '../../core/providers.dart';
import 'consent_request.dart';

class ConsentState {
  final bool isSubmitting;
  final bool isCompleted;
  final String? errorMessage;
  final bool usedLocalFallback;

  const ConsentState({
    this.isSubmitting = false,
    this.isCompleted = false,
    this.errorMessage,
    this.usedLocalFallback = false,
  });
}

class ConsentNotifier extends Notifier<ConsentState> {
  @override
  ConsentState build() => const ConsentState();

  Future<void> submitConsent(ConsentRequest request) async {
    state = const ConsentState(isSubmitting: true);

    try {
      await ref.read(dioClientProvider).post(
            '/users/me/consent',
            data: request.toJson(),
          );
      state = const ConsentState(isCompleted: true);
    } on DioException catch (e) {
      if (_isLocalDevUnreachable(e)) {
        if (kDebugMode) {
          debugPrint(
            '[ConsentNotifier] Backend unavailable (${e.type}), '
            'falling back to local-only consent',
          );
        }
        state = const ConsentState(
          isCompleted: true,
          usedLocalFallback: true,
        );
        return;
      }

      String message;
      if (e.response?.statusCode == 401) {
        message = 'Session expired. Please log in again.';
      } else if (e.response?.statusCode == 400) {
        message = (e.response?.data is Map)
            ? (e.response!.data['error']?['message'] as String? ??
                'Something went wrong. Please try again.')
            : 'Something went wrong. Please try again.';
      } else {
        message = 'Something went wrong. Please try again.';
      }
      state = ConsentState(errorMessage: message);
    }
  }

  bool _isLocalDevUnreachable(DioException e) {
    if (AppConfig.flavor != 'dev') return false;
    switch (e.type) {
      case DioExceptionType.connectionError:
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
        return true;
      default:
        return false;
    }
  }
}

final consentProvider =
    NotifierProvider<ConsentNotifier, ConsentState>(ConsentNotifier.new);
