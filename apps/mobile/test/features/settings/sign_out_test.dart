import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:okuvu/src/config/app_config.dart';
import 'package:okuvu/src/core/auth_service.dart';
import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/core/token_store.dart';
import 'package:okuvu/src/features/settings/settings_screen.dart';

/// Proves the only non-destructive route back to the Google picker: a device
/// restored from an auto-backup comes up holding the previous person's session,
/// and before this tile existed the only account control was Delete Account.
class _FakeTokenStore implements TokenStore {
  _FakeTokenStore(this.session);

  StoredSession? session;
  int clears = 0;

  @override
  Future<StoredSession?> read() async => session;

  @override
  Future<void> write(StoredSession value) async => session = value;

  @override
  Future<void> clear() async {
    clears += 1;
    session = null;
  }
}

Dio _createMockDio() {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        handler.resolve(
          Response(
            requestOptions: options,
            statusCode: 200,
            data: {'voice_enabled': false, 'success': true},
          ),
        );
      },
    ),
  );
  return dio;
}

void _installTtsChannelMock() {
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(
    const MethodChannel('flutter_tts'),
    (MethodCall call) async {
      if (call.method == 'isLanguageAvailable') return true;
      if (call.method == 'speak' || call.method == 'stop') return 1;
      return null;
    },
  );
}

const _kAuthMarker = Key('auth_marker');

/// The settings list is taller than the 800x600 default surface, and the
/// version footer sits over the last rows there — a tap on a scrolled-to tile
/// lands on the footer instead (hit test proves it). Give the file a tall
/// viewport so the whole list is on screen and the tap target is real.
void _tallViewport(WidgetTester tester) {
  tester.view.physicalSize = const Size(1200, 4800);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.reset);
}

Widget _harness(AuthService service) {
  return ProviderScope(
    overrides: [
      dioClientProvider.overrideWithValue(_createMockDio()),
      authServiceProvider.overrideWithValue(service),
    ],
    child: MaterialApp.router(
      routerConfig: GoRouter(
        initialLocation: '/settings',
        routes: [
          GoRoute(path: '/settings', builder: (_, __) => const SettingsScreen()),
          GoRoute(
            path: '/auth',
            builder: (_, __) => const Scaffold(body: SizedBox(key: _kAuthMarker)),
          ),
        ],
      ),
    ),
  );
}

_FakeTokenStore _signedInStore() => _FakeTokenStore(
      StoredSession(
        token: 'restored-token',
        expiresAt: DateTime.now().add(const Duration(days: 10)),
        subject: 'google-subject',
      ),
    );

AuthService _serviceWith(_FakeTokenStore store) => AuthService(
      store: store,
      api: _createMockDio(),
      googleSignOut: () async {},
    );

void main() {
  AppConfig.init('dev');

  setUp(_installTtsChannelMock);
  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(const MethodChannel('flutter_tts'), null);
  });

  testWidgets('Sign out clears the stored session and lands on /auth',
      (tester) async {
    _tallViewport(tester);
    final store = _signedInStore();
    await tester.pumpWidget(_harness(_serviceWith(store)));
    await tester.pumpAndSettle();

    expect(store.clears, 0, reason: 'opening Settings must not sign anyone out');

    await tester.tap(find.text('Sign out'));
    await tester.pumpAndSettle();

    expect(find.text('Sign out?'), findsOneWidget);
    expect(store.clears, 0, reason: 'the dialog is a confirmation, not the act');

    await tester.tap(find.byKey(const ValueKey('sign_out_confirm')));
    await tester.pumpAndSettle();

    expect(store.clears, 1);
    expect(store.session, isNull);
    expect(find.byKey(_kAuthMarker), findsOneWidget);
  });

  testWidgets('Cancel in the dialog keeps the session', (tester) async {
    _tallViewport(tester);
    final store = _signedInStore();
    await tester.pumpWidget(_harness(_serviceWith(store)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Sign out'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();

    expect(store.clears, 0);
    expect(store.session?.token, 'restored-token');
    expect(find.byKey(_kAuthMarker), findsNothing);
  });
}
