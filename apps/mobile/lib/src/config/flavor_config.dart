import 'app_config.dart';

class FlavorConfig {
  static const String _devBypassAuth = String.fromEnvironment(
    'LOCAL_DEV_BYPASS_AUTH',
    defaultValue: '',
  );

  /// Returns the bypass token only when flavor is 'dev'.
  /// At compile time, the token value is absent from beta/prod binaries
  /// because `--dart-define=LOCAL_DEV_BYPASS_AUTH` is never provided for them.
  static String? get devBypassToken {
    if (AppConfig.flavor != 'dev') return null;
    if (_devBypassAuth.isEmpty) return null;
    return _devBypassAuth;
  }
}
