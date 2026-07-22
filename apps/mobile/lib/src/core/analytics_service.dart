import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/foundation.dart';

class AnalyticsService {
  FirebaseAnalytics? _analytics;

  Future<void> logEvent(String name, {Map<String, dynamic>? properties}) async {
    if (kDebugMode) {
      debugPrint('[Analytics] $name ${properties ?? {}}');
    }
    try {
      _analytics ??= FirebaseAnalytics.instance;
      final safe = properties?.map((k, v) => MapEntry(k, v ?? ''));
      await _analytics!.logEvent(name: name, parameters: safe?.cast<String, Object>());
    } catch (_) {
      // Analytics unavailable (e.g., test environment)
    }
  }
}
