import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:okuvu/src/config/app_config.dart';
import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/progress/progress_screen.dart';
import 'package:okuvu/src/features/progress/weekly_mood_summary_screen.dart';

/// The weekly mood summary is the week said back in the client's own words.
/// These tests pin the shape the owner asked for — words, and no score — and
/// that it is reachable from the progress screen.
///
/// What is asserted absent matters as much as what is present: no average, no
/// band, no trend, no chart. A summary that grows a number is the defect.

Dio _mockDio({List<Map<String, Object?>>? days, List<String>? sentences}) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) {
      if (options.path == '/progress/mood/week') {
        final payload = {
            'recordedDays': days?.length ?? 0,
            'windowDays': 7,
            'days': days ?? const [],
            'repeatedFeelings': const ['tired'],
            'sentences': sentences ??
                const [
                  "No check-ins in the last 7 days yet. There's no wrong time to start.",
                ],
          };
        handler.resolve(Response(
          requestOptions: options,
          statusCode: 200,
          data: payload,
        ));
        return;
      }
      if (options.path == '/progress/mood') {
        handler.resolve(Response(
          requestOptions: options,
          statusCode: 200,
          data: {
            'entries': [
              {
                'date': DateTime.now().subtract(const Duration(days: 1)).toIso8601String(),
                'mood_value': 3,
              },
            ],
          },
        ));
        return;
      }
      if (options.path == '/users/me/context') {
        handler.resolve(Response(
          requestOptions: options,
          statusCode: 200,
          data: {
            'care_plan': {'care_plan_id': 'CP1', 'assignment_state': 'confirmed'},
            'engagement': {'current_streak': 3, 'longest_streak': 5, 'voice_mode_enabled': false},
          },
        ));
        return;
      }
      handler.resolve(Response(
        requestOptions: options,
        statusCode: 200,
        data: {'success': true},
      ));
    },
  ));
  return dio;
}

Widget _app(Dio dio, {Widget? home}) {
  return ProviderScope(
    overrides: [dioClientProvider.overrideWithValue(dio)],
    child: MaterialApp(home: home ?? const WeeklyMoodSummaryScreen()),
  );
}

void main() {
  AppConfig.init('dev');

  testWidgets('says the week back in words, day by day, with no score anywhere', (tester) async {
    final dio = _mockDio(
      days: [
        {
          'date': '2026-11-22',
          'moodLabel': 'low',
          'feelingWords': ['tired', 'worried'],
        },
        {
          'date': '2026-11-24',
          'moodLabel': 'okay',
          'feelingWords': ['tired'],
        },
      ],
      sentences: const [
        'You checked in on 2 of the last 7 days.',
        'The word you came back to: tired.',
        'The week opened at low and closed at okay.',
      ],
    );

    await tester.pumpWidget(_app(dio));
    await tester.pumpAndSettle();

    // The sentences the api composed, verbatim.
    expect(find.text('You checked in on 2 of the last 7 days.'), findsOneWidget);
    expect(find.text('The word you came back to: tired.'), findsOneWidget);
    expect(find.text('The week opened at low and closed at okay.'), findsOneWidget);

    // The client's own words, day by day.
    expect(find.text('22 Nov · low'), findsOneWidget);
    expect(find.text('tired, worried'), findsOneWidget);
    expect(find.text('24 Nov · okay'), findsOneWidget);

    // Nothing that reads as a result.
    for (final forbidden in ['average', 'score', 'out of 10', '%', 'level']) {
      expect(find.textContaining(forbidden), findsNothing, reason: forbidden);
    }
  });

  testWidgets('an empty week still gets a sentence, not a blank screen', (tester) async {
    await tester.pumpWidget(_app(_mockDio()));
    await tester.pumpAndSettle();

    expect(
      find.text("No check-ins in the last 7 days yet. There's no wrong time to start."),
      findsOneWidget,
    );
    expect(find.byType(Divider), findsNothing);
  });

  testWidgets('a day with no word is left out rather than given a placeholder', (tester) async {
    final dio = _mockDio(
      days: [
        {'date': '2026-11-22', 'feelingWords': ['tired']},
        {'date': '2026-11-23', 'moodLabel': 'calm', 'feelingWords': const []},
      ],
      sentences: const ['You checked in on 1 of the last 7 days.'],
    );

    await tester.pumpWidget(_app(dio));
    await tester.pumpAndSettle();

    expect(find.text('23 Nov · calm'), findsOneWidget);
    expect(find.textContaining('22 Nov'), findsNothing);
  });

  testWidgets('the progress screen has a way into it', (tester) async {
    final dio = _mockDio(
      days: [
        {'date': '2026-11-24', 'moodLabel': 'okay', 'feelingWords': ['tired']},
      ],
      sentences: const ['You checked in on 1 of the last 7 days.'],
    );

    final router = GoRouter(
      initialLocation: '/progress',
      routes: [
        GoRoute(path: '/progress', builder: (_, __) => const ProgressScreen()),
        GoRoute(path: '/progress/week', builder: (_, __) => const WeeklyMoodSummaryScreen()),
        GoRoute(path: '/home', builder: (_, __) => const Scaffold(body: Text('Home'))),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [dioClientProvider.overrideWithValue(dio)],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.byKey(const Key('progress_weekly_summary_link')));
    await tester.pumpAndSettle();
    // The owner's labels, 26 Nov 2026: the card and the screen it opens.
    expect(find.text('Your week, in your words'), findsOneWidget);
    await tester.tap(find.byKey(const Key('progress_weekly_summary_link')));
    await tester.pumpAndSettle();

    expect(find.text('You checked in on 1 of the last 7 days.'), findsOneWidget);
    expect(find.text('Your week'), findsOneWidget);
  });
}
