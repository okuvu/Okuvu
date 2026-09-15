import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/settings/language_screen.dart';

/// Records every request the screen makes, and always resolves GET
/// /settings/language with [initialLanguageMode] so tests can assert on
/// what gets sent without a real backend.
class _RecordingDio {
  final List<RequestOptions> requests = [];
  final String initialLanguageMode;

  _RecordingDio({this.initialLanguageMode = 'english'});

  Dio build() {
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          requests.add(options);
          if (options.method == 'GET' && options.path == '/settings/language') {
            handler.resolve(Response(
              requestOptions: options,
              statusCode: 200,
              data: {'language_mode': initialLanguageMode},
            ));
            return;
          }
          if (options.method == 'PATCH' && options.path == '/settings/language') {
            handler.resolve(Response(
              requestOptions: options,
              statusCode: 200,
              data: {'success': true},
            ));
            return;
          }
          handler.next(options);
        },
      ),
    );
    return dio;
  }
}

Widget _languageApp(Dio dio) {
  return ProviderScope(
    overrides: [dioClientProvider.overrideWithValue(dio)],
    child: MaterialApp.router(
      routerConfig: GoRouter(
        initialLocation: '/settings/language',
        routes: [
          GoRoute(
            path: '/settings',
            builder: (_, __) => const Scaffold(
              body: Center(child: Text('Settings Screen')),
            ),
            routes: [
              GoRoute(
                path: 'language',
                builder: (_, __) => const LanguageScreen(),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}

void main() {
  testWidgets('renders English and Mirror options, English selected by default',
      (tester) async {
    final recorder = _RecordingDio();
    await tester.pumpWidget(_languageApp(recorder.build()));
    await tester.pumpAndSettle();

    expect(find.text('English'), findsOneWidget);
    expect(find.text('Mirror'), findsOneWidget);
    expect(find.text('OKUVU replies in English only.'), findsOneWidget);
    expect(find.text('OKUVU mixes English and Hindi the way you do.'),
        findsOneWidget);
  });

  testWidgets('renders Mirror as selected when the backend reports mirror',
      (tester) async {
    final recorder = _RecordingDio(initialLanguageMode: 'mirror');
    await tester.pumpWidget(_languageApp(recorder.build()));
    await tester.pumpAndSettle();

    final mirrorTile = tester.widget<ListTile>(
      find.ancestor(
        of: find.text('Mirror'),
        matching: find.byType(ListTile),
      ),
    );
    expect((mirrorTile.leading as Icon).icon, LucideIcons.checkCircle2);
  });

  testWidgets('tapping Mirror sends PATCH /settings/language with mirror',
      (tester) async {
    final recorder = _RecordingDio();
    await tester.pumpWidget(_languageApp(recorder.build()));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Mirror'));
    await tester.pumpAndSettle();

    final patch = recorder.requests.firstWhere(
      (r) => r.method == 'PATCH' && r.path == '/settings/language',
    );
    expect(patch.data, {'language_mode': 'mirror'});
  });

  testWidgets('tapping English sends PATCH /settings/language with english',
      (tester) async {
    final recorder = _RecordingDio(initialLanguageMode: 'mirror');
    await tester.pumpWidget(_languageApp(recorder.build()));
    await tester.pumpAndSettle();

    await tester.tap(find.text('English'));
    await tester.pumpAndSettle();

    final patch = recorder.requests.firstWhere(
      (r) => r.method == 'PATCH' && r.path == '/settings/language',
    );
    expect(patch.data, {'language_mode': 'english'});
  });

  testWidgets('back arrow navigates to settings', (tester) async {
    final recorder = _RecordingDio();
    await tester.pumpWidget(_languageApp(recorder.build()));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(LucideIcons.arrowLeft));
    await tester.pumpAndSettle();

    expect(find.text('Settings Screen'), findsOneWidget);
  });
}
