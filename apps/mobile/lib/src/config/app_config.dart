import 'environment.dart';

class AppConfig {
  static late final Environment environment;
  static late final String baseUrl;
  static late final String flavor;

  static void init([String? flavorOverride]) {
    flavor = flavorOverride ?? const String.fromEnvironment('FLAVOR', defaultValue: '');
    if (flavor.isEmpty) {
      throw FlavorNotSpecifiedException();
    }
    environment = Environment.fromString(flavor);
    baseUrl = environment.baseUrl;
  }
}

class FlavorNotSpecifiedException implements Exception {
  @override
  String toString() {
    return 'No Flavor specified. Use --flavor with --dart-define=FLAVOR=dev|beta|prod';
  }
}
