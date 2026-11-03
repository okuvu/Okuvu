import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/history/session_transcript_screen.dart';

Dio _mockDio({
  Map<String, dynamic>? transcript,
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
              data: transcript ?? _transcript(),
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

Map<String, dynamic> _transcript({List<dynamic>? turns, String? endedAt}) {
  return {
    'id': 'session-1',
    'started_at': '2026-10-28T09:00:00.000Z',
    'ended_at': endedAt ?? '2026-10-28T09:25:00.000Z',
    'turns': turns ??
        [
          {
            'role': 'user',
            'content': 'I could not sleep again last night.',
            'turn_number': 1,
          },
          {
            'role': 'assistant',
            'content': 'That sounds exhausting. What was on your mind?',
            'turn_number': 1,
          },
        ],
  };
}

Widget _app({required Dio dio}) {
  return ProviderScope(
    overrides: [dioClientProvider.overrideWithValue(dio)],
    child: MaterialApp.router(
      routerConfig: GoRouter(
        initialLocation: '/history/session-1',
        routes: [
          GoRoute(
            path: '/history/session-1',
            builder: (_, __) =>
                const SessionTranscriptScreen(sessionId: 'session-1'),
          ),
          GoRoute(
            path: '/history',
            builder: (_, __) =>
                const Scaffold(body: Center(child: Text('History'))),
          ),
          GoRoute(
            path: '/chat',
            builder: (_, __) =>
                const Scaffold(body: Center(child: Text('Chat'))),
          ),
        ],
      ),
    ),
  );
}

void main() {
  testWidgets('shows both sides of the conversation in order', (tester) async {
    await tester.pumpWidget(_app(dio: _mockDio()));
    await tester.pumpAndSettle();

    expect(find.text('I could not sleep again last night.'), findsOneWidget);
    expect(
      find.text('That sounds exhausting. What was on your mind?'),
      findsOneWidget,
    );

    final userY = tester.getTopLeft(find.text('I could not sleep again last night.')).dy;
    final replyY = tester
        .getTopLeft(find.text('That sounds exhausting. What was on your mind?'))
        .dy;
    expect(userY, lessThan(replyY));
  });

  testWidgets('marks the reply as coming from OKUVU', (tester) async {
    await tester.pumpWidget(_app(dio: _mockDio()));
    await tester.pumpAndSettle();

    expect(find.text('OKUVU'), findsOneWidget);
  });

  testWidgets('states that the conversation is a saved record', (tester) async {
    await tester.pumpWidget(_app(dio: _mockDio()));
    await tester.pumpAndSettle();

    expect(
      find.text('This is a saved record of a past conversation.'),
      findsOneWidget,
    );
  });

  testWidgets('offers a new conversation, not a way to continue this one',
      (tester) async {
    await tester.pumpWidget(_app(dio: _mockDio()));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Start a new conversation'));
    await tester.pumpAndSettle();

    expect(find.text('Chat'), findsOneWidget);
  });

  testWidgets('handles a conversation whose reply was never stored',
      (tester) async {
    await tester.pumpWidget(
      _app(
        dio: _mockDio(
          transcript: _transcript(
            turns: [
              {
                'role': 'user',
                'content': 'Hello?',
                'turn_number': 1,
              },
            ],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Hello?'), findsOneWidget);
    expect(find.text('OKUVU'), findsNothing);
  });

  testWidgets('shows the empty transcript message when there are no turns',
      (tester) async {
    await tester.pumpWidget(
      _app(dio: _mockDio(transcript: _transcript(turns: []))),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('This conversation has no messages in it.'),
      findsOneWidget,
    );
  });

  testWidgets('shows an error with a retry when the transcript cannot load',
      (tester) async {
    await tester.pumpWidget(_app(dio: _mockDio(statusCode: 404)));
    await tester.pumpAndSettle();

    expect(
      find.textContaining("Couldn't load this conversation"),
      findsOneWidget,
    );
    expect(find.text('Try again'), findsOneWidget);
  });
}
