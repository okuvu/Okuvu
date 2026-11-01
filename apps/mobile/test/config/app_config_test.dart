import 'package:flutter_test/flutter_test.dart';
import 'package:okuvu/src/config/app_config.dart';
import 'package:okuvu/src/config/environment.dart';

void main() {
  group('Environment enum', () {
    test('dev resolves correct URLs', () {
      final env = Environment.fromString('dev');
      expect(env.label, 'dev');
      expect(env.apiBaseUrl, Environment.dev.apiBaseUrl);
      expect(env.wsBaseUrl, Environment.dev.wsBaseUrl);
    });

    test('beta resolves correct URLs', () {
      final env = Environment.fromString('beta');
      expect(env.label, 'beta');
      expect(env, Environment.beta);
      // The host itself is infrastructure-owned (it changes on every backend
      // cutover), so assert the contract — https for REST, wss for sockets —
      // rather than duplicating a literal that goes stale. Override per build
      // with --dart-define=BASE_URL / WS_URL.
      expect(env.apiBaseUrl, startsWith('https://'));
      expect(env.wsBaseUrl, startsWith('wss://'));
    });

    test('prod resolves correct URLs', () {
      final env = Environment.fromString('prod');
      expect(env.label, 'prod');
      expect(env, Environment.prod);
      expect(env.apiBaseUrl, startsWith('https://'));
      expect(env.wsBaseUrl, startsWith('wss://'));
    });

    test('unknown string throws ArgumentError', () {
      expect(() => Environment.fromString('unknown'), throwsArgumentError);
    });
  });

  group('AppConfig', () {
    AppConfig.init('dev');

    test('init with dev flavor sets correct apiBaseUrl', () {
      expect(AppConfig.apiBaseUrl, Environment.dev.apiBaseUrl);
    });

    test('init with dev flavor sets correct wsBaseUrl', () {
      expect(AppConfig.wsBaseUrl, Environment.dev.wsBaseUrl);
    });

    test('deprecated baseUrl getter matches apiBaseUrl', () {
      expect(AppConfig.baseUrl, AppConfig.apiBaseUrl);
    });

    test('init with dev flavor sets flavor string', () {
      expect(AppConfig.flavor, 'dev');
    });

    // E19-S2: the privacy policy lives on the apex domain (served by the
    // therapist portal) and the same URL is declared in the Play Store
    // listing. Pinned as a literal on purpose — this one is a contract with
    // Google Play and with the policy text, not an infrastructure detail that
    // moves when a backend is cut over.
    test('privacy policy URL points at the hosted policy on okuvu.in', () {
      expect(AppConfig.privacyPolicyUrl, 'https://okuvu.in/privacy');
      expect(Uri.parse(AppConfig.privacyPolicyUrl).scheme, 'https');
    });
  });
}
