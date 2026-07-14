import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'auth_service.dart';
import '../config/flavor_config.dart';

class AuthInterceptor extends Interceptor {
  final AuthService _authService;
  final BaseOptions _dioOptions;
  static const int _maxRetries = 3;

  AuthInterceptor(this._authService, this._dioOptions);

  @override
  void onRequest(
      RequestOptions options, RequestInterceptorHandler handler) async {
    try {
      final bypass = FlavorConfig.devBypassToken;
      if (bypass != null) {
        options.headers['Authorization'] = 'Bearer $bypass';
      } else {
        final user = _authService.currentUser;
        if (user != null) {
          final token = await user.getIdToken();
          options.headers['Authorization'] = 'Bearer $token';
        }
      }
    } catch (e) {
      if (kDebugMode)
        debugPrint(
            '[AuthInterceptor] Failed to attach Authorization header: $e');
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode == 401) {
      if (kDebugMode) debugPrint('[AuthInterceptor] 401 — signing out');
      await _authService.signOut();
      handler.next(err);
      return;
    }

    if (err.response?.statusCode == 503) {
      int retryCount = (err.requestOptions.extra['_retry_count'] as int?) ?? 0;

      while (retryCount < _maxRetries) {
        final retryAfter = err.response?.headers.value('Retry-After');
        Duration delay;
        if (retryAfter != null) {
          final seconds = int.tryParse(retryAfter);
          if (seconds != null && seconds > 0) {
            delay = Duration(seconds: seconds);
          } else {
            delay = const Duration(seconds: 2);
          }
        } else {
          delay = const Duration(seconds: 2);
        }

        if (kDebugMode) {
          debugPrint(
              '[AuthInterceptor] 503 — retrying in ${delay.inSeconds}s (attempt ${retryCount + 1}/$_maxRetries)');
        }

        await Future.delayed(delay);
        retryCount++;
        err.requestOptions.extra['_retry_count'] = retryCount;

        try {
          final response = await Dio(_dioOptions).fetch(err.requestOptions);
          handler.resolve(response);
          return;
        } catch (e) {
          if (kDebugMode) debugPrint('[AuthInterceptor] 503 retry failed: $e');
        }
      }

      if (kDebugMode)
        debugPrint('[AuthInterceptor] 503 — max retries exceeded');
      handler.next(err);
      return;
    }

    if (err.type == DioExceptionType.connectionError ||
        err.type == DioExceptionType.connectionTimeout) {
      if (kDebugMode)
        debugPrint('[AuthInterceptor] Network failure: ${err.message}');
    }

    handler.next(err);
  }
}
