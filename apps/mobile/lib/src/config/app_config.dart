import 'environment.dart';

class AppConfig {
  static late final Environment environment;
  static late final String apiBaseUrl;
  static late final String wsBaseUrl;
  static late final String flavor;

  @Deprecated('Use apiBaseUrl instead')
  static String get baseUrl => apiBaseUrl;

  static void init([String? flavorOverride]) {
    flavor = flavorOverride ?? const String.fromEnvironment('FLAVOR', defaultValue: '');
    if (flavor.isEmpty) {
      throw FlavorNotSpecifiedException();
    }
    environment = Environment.fromString(flavor);
    final baseUrlOverride = String.fromEnvironment('BASE_URL');
    apiBaseUrl = baseUrlOverride.isNotEmpty ? baseUrlOverride : environment.apiBaseUrl;
    final wsUrlOverride = String.fromEnvironment('WS_URL');
    wsBaseUrl = wsUrlOverride.isNotEmpty ? wsUrlOverride : environment.wsBaseUrl;
  }
}

class FlavorNotSpecifiedException implements Exception {
  @override
  String toString() {
    return 'No Flavor specified. Use --flavor with --dart-define=FLAVOR=dev|beta|prod';
  }
}
