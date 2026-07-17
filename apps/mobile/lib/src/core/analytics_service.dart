import 'package:flutter/foundation.dart';

class AnalyticsService {
  void logEvent(String name, {Map<String, dynamic>? properties}) {
    if (kDebugMode) {
      debugPrint('[Analytics] $name ${properties ?? {}}');
    }
  }
}
