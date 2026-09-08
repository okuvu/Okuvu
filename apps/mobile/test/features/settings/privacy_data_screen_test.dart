import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/settings/privacy_data_screen.dart';
import 'package:okuvu/src/features/settings/privacy_screen.dart';

Dio _createMockDio() {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
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

Widget _privacyDataApp() {
  final dio = _createMockDio();
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
    expect(find.byIcon(Icons.privacy_tip), findsOneWidget);
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
}
