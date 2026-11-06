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
            path: '/homework',
            builder: (_, __) => const Scaffold(body: Text('homework-screen')),
          ),
        ],
      ),
    ),
  );
}

Map<String, dynamic> _todayJson() {
  return {
    'homeworkId': 'hw-1',
    'homework': 'Write down three things you noticed today.',
    'reminders': [
      {'id': 'rem-1', 'scheduleNote': 'Practise before bed', 'toolLabel': null},
    ],
    'quote': null,
    'pendingChatAccessRequest': null,
    'therapistChatAccess': null,
    'nextAppointment': null,
    'assignedExercises': [],
    'defaultBoxBreathingPacePreset': 'standard',
    'toolPacePresets': <String, dynamic>{},
    'careEnded': false,
    'careEndedByTherapistName': null,
    'displayAbbreviation': null,
  };
}

void main() {
  group('TodayCard', () {
    testWidgets('links to the full homework list', (tester) async {
      await tester.pumpWidget(_app(_todayDio(_todayJson())));
      await tester.pumpAndSettle();

      // The card can only ever show one assignment, so the list is one tap
      // away — otherwise older homework would be unreachable without a
      // notification pointing at it.
      expect(find.text('See all homework'), findsOneWidget);

      await tester.tap(find.text('See all homework'));
      await tester.pumpAndSettle();

      expect(find.text('homework-screen'), findsOneWidget);
    });

    testWidgets('renders nothing at all when there is nothing to show', (tester) async {
      final empty = _todayJson()
        ..['homeworkId'] = null
        ..['homework'] = null
        ..['reminders'] = <dynamic>[];

      await tester.pumpWidget(_app(_todayDio(empty)));
      await tester.pumpAndSettle();

      // No empty card, and no orphaned link on it.
      expect(find.text('Today'), findsNothing);
      expect(find.text('See all homework'), findsNothing);
    });
  });
}
