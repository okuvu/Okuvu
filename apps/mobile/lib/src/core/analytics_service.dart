import 'dart:convert';

import 'package:dio/dio.dart';

import 'logger.dart';

/// Product analytics with no third-party backend.
///
/// Events are always written to the local [Logger]. When a `TELEMETRY_ENDPOINT`
/// (`--dart-define=TELEMETRY_ENDPOINT=https://…/telemetry`) is configured at
/// build time, events are also buffered and shipped in batches of
/// [batchSize] as `POST {events: [...]}`. Shipping is fire-and-forget: a failed
/// batch is dropped, never retried into a loop, and never surfaces to the user.
///
/// Public method signatures are unchanged from the previous implementation so
/// call sites (e.g. the SRS modal) and tests compile as before.
class AnalyticsService {
  AnalyticsService({
    Dio? dio,
    String? endpoint,
    this.batchSize = 20,
  })  : _endpoint = endpoint ?? const String.fromEnvironment('TELEMETRY_ENDPOINT'),
        _dio = dio ??
            Dio(
              BaseOptions(
                connectTimeout: const Duration(seconds: 5),
                receiveTimeout: const Duration(seconds: 5),
              ),
            );

  final String _endpoint;
  final Dio _dio;
  final int batchSize;

  final List<Map<String, dynamic>> _buffer = [];
  bool _flushing = false;

  bool get isRemoteEnabled => _endpoint.isNotEmpty;

  Future<void> logEvent(String name, {Map<String, dynamic>? properties}) async {
    Logger.debug('[Analytics] $name ${properties ?? {}}');
    if (!isRemoteEnabled) return;

    _buffer.add({
      'name': name,
      'properties': properties ?? const <String, dynamic>{},
      'timestamp': DateTime.now().toUtc().toIso8601String(),
    });
    if (_buffer.length >= batchSize) await flush();
  }

  /// Ships any buffered events. Never throws.
  Future<void> flush() async {
    if (!isRemoteEnabled || _buffer.isEmpty || _flushing) return;
    _flushing = true;
    final batch = List<Map<String, dynamic>>.from(_buffer);
    _buffer.clear();
    try {
      await _dio.post<dynamic>(
        _endpoint,
        data: jsonEncode({'events': batch}),
        options: Options(headers: {'Content-Type': 'application/json'}),
      );
    } catch (e) {
      Logger.debug('[Analytics] failed to ship ${batch.length} events: $e');
    } finally {
      _flushing = false;
    }
  }
}
