import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/foundation.dart';

class AnalyticsService {
  final FirebaseAnalytics _analytics = FirebaseAnalytics.instance;

  Future<void> logEvent(String name, {Map<String, dynamic>? properties}) async {
    if (kDebugMode) {
      debugPrint('[Analytics] $name ${properties ?? {}}');
    }
    await _analytics.logEvent(name: name, parameters: properties?.cast<String, Object>());
  }
}
