import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/material.dart';
import 'package:dio/dio.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/auth/waitlist_screen.dart';

class MockHttpClientAdapter implements HttpClientAdapter {
  RequestOptions? lastRequest;
  int statusCode = 200;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    lastRequest = options;
    return ResponseBody.fromString('{"success": true}', statusCode);
  }

  @override
  void close({bool force = false}) {}
}

Widget _buildApp(Dio dio, {String? phoneNumber}) {
  return ProviderScope(
    overrides: [dioClientProvider.overrideWithValue(dio)],
    child: MaterialApp(
      home: WaitlistScreen(phoneNumber: phoneNumber),
    ),
  );
}

void main() {
  late Dio dio;
  late MockHttpClientAdapter adapter;

  setUp(() {
    adapter = MockHttpClientAdapter();
    dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
    dio.httpClientAdapter = adapter;
  });

  testWidgets('rejects an invalid email', (tester) async {
    await tester.pumpWidget(_buildApp(dio));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const ValueKey('waitlist_email_input')),
      'not-an-email',
    );
    await tester.tap(find.descendant(
      of: find.byType(FilledButton),
      matching: find.text('Join the waitlist'),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Enter a valid email address'), findsOneWidget);
    expect(adapter.lastRequest, isNull);
  });

  testWidgets('submits email and phone, shows confirmation', (tester) async {
    await tester.pumpWidget(_buildApp(dio, phoneNumber: '+919876543210'));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const ValueKey('waitlist_email_input')),
      'someone@example.com',
    );
    await tester.tap(find.descendant(
      of: find.byType(FilledButton),
      matching: find.text('Join the waitlist'),
    ));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    expect(adapter.lastRequest?.path, '/waitlist');
    expect(adapter.lastRequest?.data, {
      'email': 'someone@example.com',
      'phone_number': '+919876543210',
    });
    expect(find.text("You're on the list"), findsOneWidget);
  });
}
