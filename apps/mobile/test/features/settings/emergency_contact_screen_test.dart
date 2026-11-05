import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/settings/emergency_contact_screen.dart';

Dio _mockDio({Map<String, dynamic>? contact}) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        if (options.path.endsWith('/settings/emergency-contact') && options.method == 'GET') {
          handler.resolve(Response(
            requestOptions: options,
            statusCode: 200,
            data: contact ?? {'name': null, 'phone': null},
          ));
          return;
        }
        handler.resolve(Response(requestOptions: options, statusCode: 200, data: {'success': true}));
      },
    ),
  );
  return dio;
}

Widget _buildApp({Dio? dio}) {
  final router = GoRouter(
    initialLocation: '/settings/emergency',
    routes: [
      GoRoute(
        path: '/settings/emergency',
        builder: (_, __) => const EmergencyContactScreen(),
      ),
      GoRoute(
        path: '/settings',
        builder: (_, __) => const Scaffold(body: Text('SETTINGS_MARKER')),
      ),
    ],
  );

  return ProviderScope(
    overrides: [
      dioClientProvider.overrideWithValue(dio ?? _mockDio()),
    ],
    child: MaterialApp.router(routerConfig: router),
  );
}

void main() {
  testWidgets('shows an invalid phone format error inline, not as a snackbar', (tester) async {
    await tester.pumpWidget(_buildApp());
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).at(1), '12345');
    await tester.enterText(find.byType(TextField).at(0), 'Jane');
    await tester.ensureVisible(find.text('Save'));
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(find.text('Enter a 10-digit phone number (e.g. 9876543210)'), findsOneWidget);
    expect(find.byType(SnackBar), findsNothing);
  });

  testWidgets('clears the inline phone error once the user edits the field again', (tester) async {
    await tester.pumpWidget(_buildApp());
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).at(1), '12345');
    await tester.enterText(find.byType(TextField).at(0), 'Jane');
    await tester.ensureVisible(find.text('Save'));
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(find.text('Enter a 10-digit phone number (e.g. 9876543210)'), findsOneWidget);

    await tester.enterText(find.byType(TextField).at(1), '9876543210');
    await tester.pump();

    expect(find.text('Enter a 10-digit phone number (e.g. 9876543210)'), findsNothing);
  });

  testWidgets('name field enforces a 200-character max length', (tester) async {
    await tester.pumpWidget(_buildApp());
    await tester.pumpAndSettle();

    final nameField = tester.widget<TextField>(find.byType(TextField).at(0));
    expect(nameField.maxLength, 200);
  });

  testWidgets('Save button becomes enabled as soon as a new contact has both fields filled', (tester) async {
    await tester.pumpWidget(_buildApp());
    await tester.pumpAndSettle();

    expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed, isNull);

    await tester.enterText(find.byType(TextField).at(0), 'Jane');
    await tester.pump();
    expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed, isNotNull);

    await tester.enterText(find.byType(TextField).at(0), '');
    await tester.enterText(find.byType(TextField).at(1), '9876543210');
    await tester.pump();
    expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed, isNotNull);
  });

  testWidgets('a valid phone saves successfully with no inline error', (tester) async {
    await tester.pumpWidget(_buildApp());
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).at(0), 'Jane');
    await tester.enterText(find.byType(TextField).at(1), '9876543210');
    await tester.ensureVisible(find.text('Save'));
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(find.text('Enter a 10-digit phone number (e.g. 9876543210)'), findsNothing);
  });

  testWidgets('a ten-digit number saves and sends exactly ten digits', (tester) async {
    RequestOptions? patch;
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.method == 'GET') {
            handler.resolve(Response(
              requestOptions: options,
              statusCode: 200,
              data: {'name': null, 'phone': null},
            ));
            return;
          }
          patch = options;
          handler.resolve(Response(requestOptions: options, statusCode: 200, data: {'success': true}));
        },
      ),
    );

    await tester.pumpWidget(_buildApp(dio: dio));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).at(0), 'Jane');
    await tester.enterText(find.byType(TextField).at(1), '9876543210');
    await tester.ensureVisible(find.text('Save'));
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(find.text('Enter a 10-digit phone number (e.g. 9876543210)'), findsNothing);
    expect(patch?.data, {'name': 'Jane', 'phone': '9876543210'});
  });

  testWidgets('a number with a country code is rejected with the ten-digit message', (tester) async {
    await tester.pumpWidget(_buildApp());
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).at(0), 'Jane');
    await tester.enterText(find.byType(TextField).at(1), '+919876543210');
    await tester.ensureVisible(find.text('Save'));
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(find.text('Enter a 10-digit phone number (e.g. 9876543210)'), findsOneWidget);
  });
}
