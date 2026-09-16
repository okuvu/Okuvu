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

  testWidgets('renders the header, Mood & progress, Journal, and Safety monitoring rows',
      (tester) async {
    await tester.pumpWidget(_privacyDataApp());
    await tester.pumpAndSettle();

    expect(find.text('What your therapist can see'), findsOneWidget);
    expect(find.text('Mood & progress'), findsOneWidget);
    expect(find.text('Ask me first'), findsOneWidget);
    expect(find.text('Journal'), findsOneWidget);
    expect(find.text('Private (never shared)'), findsOneWidget);
    expect(find.text('Safety monitoring'), findsOneWidget);
    expect(find.text('Always on'), findsOneWidget);
  });

  testWidgets('shows the footer note verbatim', (tester) async {
    await tester.pumpWidget(_privacyDataApp());
    await tester.pumpAndSettle();

    final footer = find.text(
      "Change any of this whenever you want. Every time your therapist looks, it's logged — nothing is silent.",
    );
    await tester.scrollUntilVisible(footer, 200, scrollable: find.byType(Scrollable).first);
    expect(footer, findsOneWidget);
  });

  testWidgets('Mood & progress: tapping "Ask me first" opens the JIT prompt; Sure shares it',
      (tester) async {
    Map<String, dynamic>? lastConsentPost;
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.path.endsWith('/users/me/today')) {
            handler.resolve(Response(
              requestOptions: options,
              statusCode: 200,
              data: {'reminders': [], 'therapistChatAccess': null},
            ));
            return;
          }
          if (options.path.endsWith('/users/me/consent')) {
            lastConsentPost = options.data as Map<String, dynamic>?;
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

    await tester.tap(find.text('Ask me first'));
    await tester.pumpAndSettle();

    expect(
      find.text(
        'Keep your mood check-ins so you can see patterns? Your therapist sees the trend only if you share mood & progress.',
      ),
      findsOneWidget,
    );

    await tester.tap(find.text('Sure'));
    await tester.pumpAndSettle();

    expect(lastConsentPost, isNotNull);
    expect(lastConsentPost!['mood_inference'], true);
    expect(lastConsentPost!['assessment'], true);
    expect(find.text('Shared'), findsOneWidget);
  });

  testWidgets('Emergency contact: shows "Not set" and opens the JIT prompt on tap',
      (tester) async {
    await tester.pumpWidget(_privacyDataApp());
    await tester.pumpAndSettle();

    expect(find.text('Emergency contact'), findsOneWidget);
    expect(find.text('Not set'), findsOneWidget);

    await tester.tap(find.text('Emergency contact'));
    await tester.pumpAndSettle();

    expect(
      find.text(
        "Add a contact we can reach if you're ever in danger? They're only ever contacted in an emergency.",
      ),
      findsOneWidget,
    );
  });
}
