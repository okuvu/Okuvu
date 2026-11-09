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
      'kind': 'tool',
      'toolId': 'ws_three_good_things',
      'homeworkId': 'hw-1',
      'label': 'Three good things',
      'estMinutes': 3,
      'dueAt': '2026-11-11T10:00:00.000Z',
      'loadLevel': 'light',
      'repeats': false,
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

      // Step 6 correction: still one main item, and the reminder line and the
      // quote are back underneath it, smaller.
      expect(find.textContaining('Practise before bed'), findsOneWidget);
      expect(find.byKey(const Key('today_card_quote')), findsOneWidget);
      expect(find.textContaining('must not be on the card'), findsOneWidget);
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
          'kind': 'tool',
          'toolId': 'grounding_5431',
          'homeworkId': null,
          'label': '5-4-3-2-1 grounding',
          'estMinutes': 3,
          'dueAt': null,
          'loadLevel': 'light',
          'repeats': false,
        };

      await tester.pumpWidget(_app(_todayDio(suggested)));
      await tester.pumpAndSettle();

      expect(find.text('5-4-3-2-1 grounding'), findsOneWidget);
      expect(find.text('3 min'), findsOneWidget);
      // One item, not the assignment plus a suggestion.
      expect(find.text('Three good things'), findsNothing);
    });

    testWidgets('renders nothing at all when there is nothing to show', (tester) async {
      final empty = _todayJson()
        ..['next'] = null
        ..['reminders'] = <dynamic>[]
        ..['quote'] = null;

      await tester.pumpWidget(_app(_todayDio(empty)));
      await tester.pumpAndSettle();

      // No empty card, and no streak, badge or missed-day warning either.
      expect(find.text('Today'), findsNothing);
      expect(find.textContaining('missed'), findsNothing);
    });

    testWidgets('shows homework the therapist typed in their own words', (tester) async {
      final typed = _todayJson()
        ..['next'] = {
          'source': 'assigned',
          'kind': 'text_homework',
          'toolId': null,
          'homeworkId': 'hw-typed',
          'label': 'Write down one thing you are looking forward to.',
          'estMinutes': null,
          'dueAt': null,
          'loadLevel': null,
          'repeats': false,
        };

      await tester.pumpWidget(_app(_todayDio(typed)));
      await tester.pumpAndSettle();

      expect(find.text('Write down one thing you are looking forward to.'), findsOneWidget);
      expect(find.textContaining('min'), findsNothing);
    });
  });
}
