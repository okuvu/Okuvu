import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/settings/profile_screen.dart';

class _RecordingDio {
  final List<RequestOptions> requests = [];
  final Map<String, dynamic> profileData;

  _RecordingDio({Map<String, dynamic>? profileData})
      : profileData = profileData ??
            {
              'full_name': 'Jordan Lee',
              'email': 'jordan@example.com',
              'date_of_birth': '2000-01-15T00:00:00.000Z',
              'gender': 'nonbinary',
            };

  Dio build() {
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          requests.add(options);
          if (options.method == 'GET' && options.path == '/settings/profile') {
            handler.resolve(Response(
              requestOptions: options,
              statusCode: 200,
              data: profileData,
            ));
            return;
          }
          if (options.method == 'PATCH' && options.path == '/settings/profile') {
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
        initialLocation: '/settings/profile',
        routes: [
          GoRoute(
            path: '/settings',
            builder: (_, __) => const Scaffold(body: Center(child: Text('Settings Screen'))),
            routes: [
              GoRoute(
                path: 'profile',
                builder: (_, __) => const ProfileScreen(),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}

void main() {
  testWidgets('prefills fields from GET /settings/profile', (tester) async {
    final recorder = _RecordingDio();
    await tester.pumpWidget(_buildApp(recorder.build()));
    await tester.pumpAndSettle();

    expect(find.text('jordan@example.com'), findsOneWidget);
    final nameField = tester.widget<TextField>(
      find.byKey(const ValueKey('profile_full_name_input')),
    );
    expect(nameField.controller!.text, 'Jordan Lee');
    expect(find.text('15/01/2000'), findsOneWidget);
  });

  testWidgets('shows "Not set" when email is null', (tester) async {
    final recorder = _RecordingDio(profileData: {
      'full_name': null,
      'email': null,
      'date_of_birth': null,
      'gender': null,
    });
    await tester.pumpWidget(_buildApp(recorder.build()));
    await tester.pumpAndSettle();

    expect(find.text('Not set'), findsOneWidget);
  });

  testWidgets('Save sends a PATCH with edited fields', (tester) async {
    final recorder = _RecordingDio();
    await tester.pumpWidget(_buildApp(recorder.build()));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const ValueKey('profile_full_name_input')),
      'New Name',
    );
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    final patch = recorder.requests.firstWhere(
      (r) => r.method == 'PATCH' && r.path == '/settings/profile',
    );
    final data = patch.data as Map<String, dynamic>;
    expect(data['full_name'], 'New Name');
    expect(data['date_of_birth'], '2000-01-15T00:00:00.000Z');
    expect(data['gender'], 'nonbinary');
    expect(find.text('Profile saved'), findsOneWidget);
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
