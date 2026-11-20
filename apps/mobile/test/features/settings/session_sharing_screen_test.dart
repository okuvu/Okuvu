import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/settings/session_sharing_screen.dart';

/// The per-session screen exists for one sentence: "keep that one session
/// private". These tests hold the two halves of it — the list never carries
/// summary text, and a withhold is written to that session's own endpoint.
Dio _dio({
  bool relationshipOpen = true,
  List<Map<String, dynamic>>? sessions,
  void Function(RequestOptions)? onPatch,
}) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        if (options.method == 'PATCH') {
          onPatch?.call(options);
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
              'status': 'ok',
              'therapistName': 'Dr. Rao',
              'expiresAt': relationshipOpen ? '2026-12-10T09:00:00.000Z' : null,
              'sessions': sessions ??
                  [
                    {
                      'sessionId': 's-1',
                      'startedAt': '2026-11-18T10:00:00.000Z',
                      'status': 'COMPLETED',
                      'shared': true,
                    },
                    {
                      'sessionId': 's-2',
                      'startedAt': '2026-11-11T10:00:00.000Z',
                      'status': 'COMPLETED',
                      'shared': false,
                    },
                  ],
            },
          ),
        );
      },
    ),
  );
  return dio;
}

Widget _app(Dio dio) {
  return ProviderScope(
    overrides: [dioClientProvider.overrideWithValue(dio)],
    child: MaterialApp.router(
      routerConfig: GoRouter(
        initialLocation: '/settings/session-sharing',
        routes: [
          GoRoute(
            path: '/settings',
            builder: (_, __) => const Scaffold(body: Center(child: Text('Settings Screen'))),
            routes: [
              GoRoute(
                path: 'session-sharing',
                builder: (_, __) => const SessionSharingScreen(),
              ),
              GoRoute(
                path: 'privacy',
                builder: (_, __) => const Scaffold(body: Center(child: Text('Privacy Screen'))),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}

void main() {
  testWidgets('lists each session with its sharing state, and no summary text',
      (tester) async {
    await tester.pumpWidget(_app(_dio()));
    await tester.pumpAndSettle();

    expect(find.text('Session summaries'), findsOneWidget);
    expect(find.textContaining('Dr. Rao'), findsOneWidget);
    expect(find.byType(Switch), findsNWidgets(2));

    final switches = tester.widgetList<Switch>(find.byType(Switch)).toList();
    expect(switches[0].value, isTrue);
    expect(switches[1].value, isFalse);

    // The screen must not have been handed any therapist reading to render.
    expect(find.textContaining('narrative'), findsNothing);
    expect(find.textContaining('themes:'), findsNothing);
  });

  testWidgets('turning a session off PATCHes that session only', (tester) async {
    RequestOptions? patched;
    await tester.pumpWidget(_app(_dio(onPatch: (o) => patched = o)));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(Switch).first);
    await tester.pumpAndSettle();

    expect(patched?.path, '/users/me/sessions/s-1/summary-share');
    expect(patched?.data, {'shared': false});
  });

  testWidgets('disables the switches and explains when nothing is shared overall',
      (tester) async {
    await tester.pumpWidget(_app(_dio(relationshipOpen: false)));
    await tester.pumpAndSettle();

    expect(find.textContaining('not being shared right now'), findsOneWidget);
    for (final s in tester.widgetList<Switch>(find.byType(Switch))) {
      expect(s.onChanged, isNull);
    }
  });

  testWidgets('says there is nothing to decide about before the first session',
      (tester) async {
    await tester.pumpWidget(_app(_dio(sessions: [])));
    await tester.pumpAndSettle();

    expect(find.textContaining('No sessions yet'), findsOneWidget);
    expect(find.byType(Switch), findsNothing);
  });
}
