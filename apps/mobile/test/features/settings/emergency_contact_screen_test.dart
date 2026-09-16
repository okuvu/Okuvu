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

    expect(find.text('Phone must be in international format (e.g. +1234567890)'), findsOneWidget);
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

    expect(find.text('Phone must be in international format (e.g. +1234567890)'), findsOneWidget);

    await tester.enterText(find.byType(TextField).at(1), '+1234567890');
    await tester.pump();

    expect(find.text('Phone must be in international format (e.g. +1234567890)'), findsNothing);
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
    await tester.enterText(find.byType(TextField).at(1), '+1234567890');
    await tester.pump();
    expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed, isNotNull);
  });

  testWidgets('a valid phone saves successfully with no inline error', (tester) async {
    await tester.pumpWidget(_buildApp());
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).at(0), 'Jane');
    await tester.enterText(find.byType(TextField).at(1), '+1234567890');
    await tester.ensureVisible(find.text('Save'));
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(find.text('Phone must be in international format (e.g. +1234567890)'), findsNothing);
  });
}
