import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/settings/notifications_screen.dart';

class _RecordingDio {
  final List<RequestOptions> requests = [];
  final bool initialReminders;
  final bool initialNudges;

  _RecordingDio({this.initialReminders = true, this.initialNudges = true});

  Dio build() {
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          requests.add(options);
          if (options.method == 'GET' && options.path == '/settings/notifications') {
            handler.resolve(Response(
              requestOptions: options,
              statusCode: 200,
              data: {
                'appointment_reminders_enabled': initialReminders,
                'chat_nudges_enabled': initialNudges,
              },
            ));
            return;
          }
          if (options.method == 'PATCH' && options.path == '/settings/notifications') {
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

Widget _buildApp(Dio dio) {
  return ProviderScope(
    overrides: [dioClientProvider.overrideWithValue(dio)],
    child: MaterialApp.router(
      routerConfig: GoRouter(
        initialLocation: '/settings/notifications',
        routes: [
          GoRoute(
            path: '/settings',
            builder: (_, __) => const Scaffold(body: Center(child: Text('Settings Screen'))),
            routes: [
              GoRoute(
                path: 'notifications',
                builder: (_, __) => const NotificationsScreen(),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}

void main() {
  testWidgets('renders both toggles reflecting backend state', (tester) async {
    final recorder = _RecordingDio(initialReminders: true, initialNudges: false);
    await tester.pumpWidget(_buildApp(recorder.build()));
    await tester.pumpAndSettle();

    final reminders = tester.widget<SwitchListTile>(
      find.byKey(const ValueKey('appointment_reminders_toggle')),
    );
    final nudges = tester.widget<SwitchListTile>(
      find.byKey(const ValueKey('chat_nudges_toggle')),
    );
    expect(reminders.value, isTrue);
    expect(nudges.value, isFalse);
  });

  testWidgets('toggling appointment reminders sends PATCH', (tester) async {
    final recorder = _RecordingDio();
    await tester.pumpWidget(_buildApp(recorder.build()));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('appointment_reminders_toggle')));
    await tester.pumpAndSettle();

    final patch = recorder.requests.firstWhere(
      (r) => r.method == 'PATCH' && r.path == '/settings/notifications',
    );
    expect(patch.data, {'appointment_reminders_enabled': false});
  });

  testWidgets('toggling chat nudges sends PATCH', (tester) async {
    final recorder = _RecordingDio();
    await tester.pumpWidget(_buildApp(recorder.build()));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('chat_nudges_toggle')));
    await tester.pumpAndSettle();

    final patch = recorder.requests.firstWhere(
      (r) => r.method == 'PATCH' && r.path == '/settings/notifications',
    );
    expect(patch.data, {'chat_nudges_enabled': false});
  });

  testWidgets('back arrow navigates to settings', (tester) async {
    final recorder = _RecordingDio();
    await tester.pumpWidget(_buildApp(recorder.build()));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(LucideIcons.arrowLeft));
    await tester.pumpAndSettle();

    expect(find.text('Settings Screen'), findsOneWidget);
  });
}
