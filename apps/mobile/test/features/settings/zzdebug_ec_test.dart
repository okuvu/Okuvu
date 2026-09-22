import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/settings/emergency_contact_screen.dart';

Dio _mockDio() {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        handler.resolve(Response(requestOptions: options, statusCode: 200, data: {'name': null, 'phone': null}));
      },
    ),
  );
  return dio;
}

void main() {
  testWidgets('debug button state', (tester) async {
    final router = GoRouter(
      initialLocation: '/settings/emergency',
      routes: [
        GoRoute(path: '/settings/emergency', builder: (_, __) => const EmergencyContactScreen()),
        GoRoute(path: '/settings', builder: (_, __) => const Scaffold(body: Text('X'))),
      ],
    );
    await tester.pumpWidget(ProviderScope(
      overrides: [dioClientProvider.overrideWithValue(_mockDio())],
      child: MaterialApp.router(routerConfig: router),
    ));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).at(0), 'Jane');
    await tester.pump();

    final button = tester.widget<FilledButton>(find.byType(FilledButton));
    print('onPressed is null: ${button.onPressed == null}');
  });
}
