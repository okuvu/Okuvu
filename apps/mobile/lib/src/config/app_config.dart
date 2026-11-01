import 'environment.dart';

class AppConfig {
  static late final Environment environment;
  static late final String apiBaseUrl;
  static late final String wsBaseUrl;
  static late final String flavor;

  /// E19-S2 — the canonical privacy policy, served by the therapist portal at
  /// `/privacy` and reachable over TLS at okuvu.in/privacy (the 443 listener's
  /// host rule forwards okuvu.in/www.okuvu.in to the portal target group).
  ///
  /// This URL is also the one declared in the Play Store listing, so the app,
  /// the store listing and the policy text cannot drift apart. It replaced a
  /// Google Docs "pub" link, which was never a stable legal record.
  static const String privacyPolicyUrl = 'https://okuvu.in/privacy';

  @Deprecated('Use apiBaseUrl instead')
  static String get baseUrl => apiBaseUrl;

  static void init([String? flavorOverride]) {
    flavor = flavorOverride ??
        const String.fromEnvironment('FLAVOR', defaultValue: '');
    if (flavor.isEmpty) {
      throw FlavorNotSpecifiedException();
    }
    environment = Environment.fromString(flavor);
    const baseUrlOverride = String.fromEnvironment('BASE_URL');
    apiBaseUrl =
        baseUrlOverride.isNotEmpty ? baseUrlOverride : environment.apiBaseUrl;
    const wsUrlOverride = String.fromEnvironment('WS_URL');
    wsBaseUrl =
        wsUrlOverride.isNotEmpty ? wsUrlOverride : environment.wsBaseUrl;
  }
}

class FlavorNotSpecifiedException implements Exception {
  @override
  String toString() {
    return 'No Flavor specified. Use --flavor with --dart-define=FLAVOR=dev|beta|prod';
  }
}
