import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/home/widgets/today_card.dart';

Dio _todayDio(Map<String, dynamic> today) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) {
      handler.resolve(Response(
        requestOptions: options,
        statusCode: 200,
        data: today,
      ));
    },
  ));
  return dio;
}

Widget _app(Dio dio) {
  return ProviderScope(
    overrides: [dioClientProvider.overrideWithValue(dio)],
    child: MaterialApp.router(
      routerConfig: GoRouter(
        initialLocation: '/home',
        routes: [
          GoRoute(
            path: '/home',
            builder: (_, __) => const Scaffold(
              body: SingleChildScrollView(child: TodayCard()),
            ),
          ),
          GoRoute(
            path: '/library/worksheet/:toolId',
            builder: (_, state) => Scaffold(
              body: Text('worksheet-${state.pathParameters['toolId']}'),
            ),
          ),
        ],
      ),
    ),
  );
}

Map<String, dynamic> _todayJson() {
  return {
    'homeworkId': null,
    'homework': null,
    'reminders': [
      {'id': 'rem-1', 'scheduleNote': 'Practise before bed', 'toolLabel': null},
    ],
    'quote': 'A quote that must not be on the card any more.',
    'pendingChatAccessRequest': null,
    'therapistChatAccess': null,
    'nextAppointment': null,
    'assignedExercises': [],
    'defaultBoxBreathingPacePreset': 'standard',
    'toolPacePresets': <String, dynamic>{},
    'careEnded': false,
    'careEndedByTherapistName': null,
    'displayAbbreviation': null,
    'next': {
      'source': 'assigned',
      'toolId': 'ws_three_good_things',
      'homeworkId': 'hw-1',
      'label': 'Three good things',
      'estMinutes': 3,
      'dueAt': '2026-11-11T10:00:00.000Z',
      'loadLevel': 'light',
    },
  };
}

void main() {
  group('TodayCard — one thing, and no more', () {
    testWidgets('shows the next assigned exercise with its minutes, and nothing else',
        (tester) async {
      await tester.pumpWidget(_app(_todayDio(_todayJson())));
      await tester.pumpAndSettle();

      expect(find.text('Today'), findsOneWidget);
      expect(find.text('Three good things'), findsOneWidget);
      expect(find.text('3 min'), findsOneWidget);

      // Step 5 — the card is not a list. The reminder and the quote are still
      // in the payload and must not be rendered.
      expect(find.textContaining('Practise before bed'), findsNothing);
      expect(find.textContaining('must not be on the card'), findsNothing);
    });

    testWidgets('opens the exercise it shows', (tester) async {
      await tester.pumpWidget(_app(_todayDio(_todayJson())));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('today_card_item')));
      await tester.pumpAndSettle();

      expect(find.text('worksheet-ws_three_good_things'), findsOneWidget);
    });

    testWidgets('offers one light exercise when nothing is assigned', (tester) async {
      final suggested = _todayJson()
        ..['next'] = {
          'source': 'suggested',
          'toolId': 'grounding_5431',
          'homeworkId': null,
          'label': '5-4-3-2-1 grounding',
          'estMinutes': 3,
          'dueAt': null,
          'loadLevel': 'light',
        };

      await tester.pumpWidget(_app(_todayDio(suggested)));
      await tester.pumpAndSettle();

      expect(find.text('5-4-3-2-1 grounding'), findsOneWidget);
      expect(find.text('3 min'), findsOneWidget);
      // One item, not the assignment plus a suggestion.
      expect(find.text('Three good things'), findsNothing);
    });

    testWidgets('renders nothing at all when there is nothing to show', (tester) async {
      final empty = _todayJson()..['next'] = null;

      await tester.pumpWidget(_app(_todayDio(empty)));
      await tester.pumpAndSettle();

      // No empty card, and no streak, badge or missed-day warning either.
      expect(find.text('Today'), findsNothing);
      expect(find.textContaining('missed'), findsNothing);
    });
  });
}
