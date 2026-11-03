import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/history/session_history_screen.dart';

Dio _mockDio({
  List<dynamic>? sessions,
  int statusCode = 200,
}) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        if (statusCode == 200) {
          handler.resolve(
            Response(
              requestOptions: options,
              statusCode: 200,
              data: {'sessions': sessions ?? const []},
            ),
          );
        } else {
          handler.reject(
            DioException(
              requestOptions: options,
              type: DioExceptionType.badResponse,
              response: Response(
                requestOptions: options,
                statusCode: statusCode,
              ),
            ),
          );
        }
      },
    ),
  );
  return dio;
}

Widget _app({required Dio dio}) {
  return ProviderScope(
    overrides: [dioClientProvider.overrideWithValue(dio)],
    child: MaterialApp.router(
      routerConfig: GoRouter(
        initialLocation: '/history',
        routes: [
          GoRoute(
            path: '/history',
            builder: (_, __) => const SessionHistoryScreen(),
          ),
          GoRoute(
            path: '/history/:id',
            builder: (_, state) => Scaffold(
              body: Center(child: Text('transcript ${state.pathParameters['id']}')),
            ),
          ),
          GoRoute(
            path: '/home',
            builder: (_, __) =>
                const Scaffold(body: Center(child: Text('Home'))),
          ),
        ],
      ),
    ),
  );
}

Map<String, dynamic> _session({
  String id = 'session-1',
  String? preview = 'I could not sleep again last night.',
  int turnCount = 3,
  int messageCount = 6,
  String? endedAt = '2026-10-28T09:25:00.000Z',
}) {
  return {
    'id': id,
    'started_at': '2026-10-28T09:00:00.000Z',
    'ended_at': endedAt,
    'turn_count': turnCount,
    'message_count': messageCount,
    'preview': preview,
  };
}

void main() {
  testWidgets('shows the empty state when there are no past conversations',
      (tester) async {
    await tester.pumpWidget(_app(dio: _mockDio(sessions: [])));
    await tester.pumpAndSettle();

    expect(
      find.textContaining('No past conversations yet'),
      findsOneWidget,
    );
  });

  testWidgets('lists a past conversation with its preview, date and size',
      (tester) async {
    await tester.pumpWidget(_app(dio: _mockDio(sessions: [_session()])));
    await tester.pumpAndSettle();

    expect(find.text('I could not sleep again last night.'), findsOneWidget);
    expect(find.textContaining('28 Oct 2026'), findsOneWidget);
    expect(find.text('6 messages'), findsOneWidget);
    expect(
      find.text('Every chat you finish is kept here. Only you can see it.'),
      findsOneWidget,
    );
  });

  testWidgets('falls back to "Conversation" when the opening message is blank',
      (tester) async {
    await tester.pumpWidget(
      _app(dio: _mockDio(sessions: [_session(preview: null)])),
    );
    await tester.pumpAndSettle();

    expect(find.text('Conversation'), findsOneWidget);
  });

  testWidgets('tapping a conversation opens its transcript', (tester) async {
    await tester.pumpWidget(_app(dio: _mockDio(sessions: [_session()])));
    await tester.pumpAndSettle();

    await tester.tap(find.text('I could not sleep again last night.'));
    await tester.pumpAndSettle();

    expect(find.text('transcript session-1'), findsOneWidget);
  });

  testWidgets('shows an error with a retry when the list cannot load',
      (tester) async {
    await tester.pumpWidget(_app(dio: _mockDio(statusCode: 500)));
    await tester.pumpAndSettle();

    expect(
      find.textContaining("Couldn't load your past conversations"),
      findsOneWidget,
    );
    expect(find.text('Try again'), findsOneWidget);
  });
}
