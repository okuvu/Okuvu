import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/settings/privacy_data_screen.dart';
import 'package:okuvu/src/features/settings/privacy_screen.dart';

Dio _createMockDio({Map<String, dynamic>? therapistChatAccess}) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        if (options.path.endsWith('/users/me/today')) {
          handler.resolve(
            Response(
              requestOptions: options,
              statusCode: 200,
              data: {
                'reminders': [],
                'therapistChatAccess': therapistChatAccess,
              },
            ),
          );
          return;
        }
        if (options.path.endsWith('/users/me/chat-access')) {
          handler.resolve(
            Response(requestOptions: options, statusCode: 200, data: {'success': true}),
          );
          return;
        }
        handler.resolve(
          Response(
            requestOptions: options,
            statusCode: 200,
            data: {
              'consent': {
                'safety_monitoring': true,
                'mood_understanding': false,
                'progress_tracking': true,
                'emergency_contact': false,
              },
            },
          ),
        );
      },
    ),
  );
  return dio;
}

Widget _privacyDataApp({Map<String, dynamic>? therapistChatAccess}) {
  final dio = _createMockDio(therapistChatAccess: therapistChatAccess);
  return ProviderScope(
    overrides: [dioClientProvider.overrideWithValue(dio)],
    child: MaterialApp.router(
      routerConfig: GoRouter(
        initialLocation: '/settings/privacy',
        routes: [
          GoRoute(
            path: '/settings',
            builder: (_, __) => const Scaffold(
              body: Center(child: Text('Settings Screen')),
            ),
            routes: [
              GoRoute(
                path: 'privacy',
                builder: (_, __) => const PrivacyDataScreen(),
              ),
              GoRoute(
                path: 'privacy-policy',
                builder: (_, __) => const PrivacyScreen(),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}

void main() {
  testWidgets('renders Privacy Policy row', (tester) async {
    await tester.pumpWidget(_privacyDataApp());
    await tester.pumpAndSettle();

    expect(find.text('Privacy Policy'), findsOneWidget);
    expect(find.byIcon(LucideIcons.shieldAlert), findsOneWidget);
  });

  testWidgets('tapping Privacy Policy navigates to PrivacyScreen',
      (tester) async {
    await tester.pumpWidget(_privacyDataApp());
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('Privacy Policy'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Privacy Policy'));
    await tester.pumpAndSettle();

    expect(find.byType(PrivacyScreen), findsOneWidget);
  });

  testWidgets('hides the Chat summaries toggle when there is no assigned therapist',
      (tester) async {
    await tester.pumpWidget(_privacyDataApp(therapistChatAccess: null));
    await tester.pumpAndSettle();

    expect(find.text('Chat summaries'), findsNothing);
  });

  testWidgets('shows the Chat summaries toggle reflecting the current grant state',
      (tester) async {
    await tester.pumpWidget(_privacyDataApp(therapistChatAccess: {
      'therapistId': 'th_1',
      'therapistName': 'Dr. Rao',
      'granted': true,
    }));
    await tester.pumpAndSettle();

    expect(find.text('Chat summaries'), findsOneWidget);
    final switchWidget = tester.widget<Switch>(find.byType(Switch).last);
    expect(switchWidget.value, isTrue);
  });

  testWidgets('toggling off calls PATCH /users/me/chat-access with granted:false',
      (tester) async {
    RequestOptions? lastPatchRequest;
    Map<String, dynamic>? lastPatchData;

    final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.path.endsWith('/users/me/today')) {
            handler.resolve(Response(
              requestOptions: options,
              statusCode: 200,
              data: {
                'reminders': [],
                'therapistChatAccess': {
                  'therapistId': 'th_1',
                  'therapistName': 'Dr. Rao',
                  'granted': true,
                },
              },
            ));
            return;
          }
          if (options.path.endsWith('/users/me/chat-access')) {
            lastPatchRequest = options;
            lastPatchData = options.data as Map<String, dynamic>?;
            handler.resolve(
              Response(requestOptions: options, statusCode: 200, data: {'success': true}),
            );
            return;
          }
          handler.resolve(Response(requestOptions: options, statusCode: 200, data: {}));
        },
      ),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [dioClientProvider.overrideWithValue(dio)],
        child: MaterialApp.router(
          routerConfig: GoRouter(
            initialLocation: '/settings/privacy',
            routes: [
              GoRoute(
                path: '/settings',
                builder: (_, __) => const Scaffold(body: Center(child: Text('Settings Screen'))),
                routes: [
                  GoRoute(path: 'privacy', builder: (_, __) => const PrivacyDataScreen()),
                ],
              ),
            ],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('Chat summaries'));
    await tester.tap(find.byType(Switch).last);
    await tester.pumpAndSettle();

    expect(lastPatchRequest?.path, contains('/users/me/chat-access'));
    expect(lastPatchData, {'therapist_id': 'th_1', 'granted': false});
  });
}
