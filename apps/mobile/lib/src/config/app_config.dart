import 'environment.dart';

class AppConfig {
  static late final Environment environment;
  static late final String apiBaseUrl;
  static late final String wsBaseUrl;
  static late final String flavor;

  static const String privacyPolicyUrl = 'https://docs.google.com/document/d/e/2PACX-1vQgv2bJgSDak1iNPiO698VBHQ9fn8IOK9GoBjLU--HRGBHLn3rS-hS8gKhnT6uDh_havhWeVBexEEDx/pub';

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
