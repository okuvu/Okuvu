import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import 'logger.dart';

/// Crash reporting seam that replaces the hosted crash backend.
///
/// Always logs locally through [Logger]. When a `CRASH_ENDPOINT`
/// (`--dart-define=CRASH_ENDPOINT=https://…/telemetry/crash`) is configured at
/// build time, the report is also POSTed there fire-and-forget. Reporting must
/// never throw, never block startup, and never be the reason a user-visible
/// error is swallowed — so every failure here is logged and dropped.
class CrashReporter {
  CrashReporter({
    Dio? dio,
    String? endpoint,
    String? appVersion,
  })  : _endpoint = endpoint ?? const String.fromEnvironment('CRASH_ENDPOINT'),
        _appVersion = appVersion ??
            const String.fromEnvironment('APP_VERSION', defaultValue: 'dev'),
        _dio = dio ??
            Dio(
              BaseOptions(
                connectTimeout: const Duration(seconds: 5),
                receiveTimeout: const Duration(seconds: 5),
              ),
            );

  final String _endpoint;
  final String _appVersion;
  final Dio _dio;

  bool get isRemoteEnabled => _endpoint.isNotEmpty;

  /// Records a non-fatal error (handled exception, failed request, …).
  Future<void> recordError(
    Object error,
    StackTrace? stack, {
    bool fatal = false,
    String? reason,
  }) async {
    final message = reason == null ? '$error' : '$reason: $error';
    Logger.debug('[CrashReporter] ${fatal ? 'FATAL' : 'error'} $message');
    if (stack != null) Logger.debug('[CrashReporter] $stack');
    if (!isRemoteEnabled) return;

    try {
      await _dio.post<dynamic>(
        _endpoint,
        data: jsonEncode({
          'message': message,
          'stack': stack?.toString(),
          'fatal': fatal,
          'platform': defaultTargetPlatform.name,
          'app_version': _appVersion,
          'timestamp': DateTime.now().toUtc().toIso8601String(),
        }),
        options: Options(headers: {'Content-Type': 'application/json'}),
      );
    } catch (e) {
      Logger.debug('[CrashReporter] failed to ship report: $e');
    }
  }

  /// `FlutterError.onError` hook.
  void recordFlutterFatalError(FlutterErrorDetails details) {
    Logger.debug('[CrashReporter] FlutterError: ${details.exceptionAsString()}');
    // Intentionally not awaited: the error hook is synchronous.
    unawaited(recordError(
      details.exception,
      details.stack,
      fatal: true,
      reason: details.context?.toDescription(),
    ));
  }

  /// `PlatformDispatcher.onError` / `runZonedGuarded` hook.
  void recordZoneError(Object error, StackTrace stack) {
    unawaited(recordError(error, stack, fatal: true));
  }
}
