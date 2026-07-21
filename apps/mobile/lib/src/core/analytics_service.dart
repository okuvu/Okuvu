import 'package:firebase_analytics/firebase_analytics.dart';
import 'logger.dart';

class AnalyticsService {
  final FirebaseAnalytics _analytics = FirebaseAnalytics.instance;

  Future<void> logEvent(String name, {Map<String, dynamic>? properties}) async {
    Logger.debug('[Analytics] $name ${properties ?? {}}');
    final safe = properties?.map((k, v) => MapEntry(k, v ?? ''));
    await _analytics.logEvent(name: name, parameters: safe?.cast<String, Object>());
  }
}
