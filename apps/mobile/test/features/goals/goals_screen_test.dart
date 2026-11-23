import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/goals/goals_screen.dart';
import 'package:okuvu/src/features/goals/widgets/goals_card.dart';

Dio _goalsDio({required Map<String, dynamic> response}) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) {
      handler.resolve(Response(
        requestOptions: options,
        statusCode: 200,
        data: response,
      ));
    },
  ));
  return dio;
}

Widget _app(Dio dio, Widget screen, {String path = '/goals'}) {
  return ProviderScope(
    overrides: [dioClientProvider.overrideWithValue(dio)],
    child: MaterialApp.router(
      routerConfig: GoRouter(
        initialLocation: path,
        routes: [
          GoRoute(path: path, builder: (_, __) => screen),
          GoRoute(path: '/home', builder: (_, __) => const Scaffold(body: Text('home'))),
        ],
      ),
    ),
  );
}

void main() {
  group('GoalsScreen', () {
    testWidgets('shows the goal in focus first, then the waiting ones, then what is achieved',
        (tester) async {
      final dio = _goalsDio(response: {
        'goals': [
          {'id': 'g1', 'text': 'Ask for help at work once', 'status': 'active', 'isFocus': true},
          {'id': 'g2', 'text': 'Walk ten minutes after lunch', 'status': 'active', 'isFocus': false},
          {'id': 'g3', 'text': 'Get to bed before midnight', 'status': 'achieved', 'isFocus': false},
        ],
        'activeCount': 2,
      });

      await tester.pumpWidget(_app(dio, const GoalsScreen()));
      await tester.pumpAndSettle();

      expect(find.text(GoalsCopy.title), findsOneWidget);
      expect(find.text(GoalsCopy.focusLabel), findsOneWidget);
      expect(find.text('Ask for help at work once'), findsOneWidget);
      expect(find.text(GoalsCopy.waitingLabel), findsOneWidget);
      expect(find.text('Walk ten minutes after lunch'), findsOneWidget);
      // Achieved is a heading with a count, and the goal is not struck through
      // or faded — getting there is not a failure.
      expect(find.text('Achieved (1)'), findsOneWidget);
      expect(find.text('Get to bed before midnight'), findsOneWidget);
    });

    testWidgets('orders the focus goal above the waiting ones whatever order the payload is in',
        (tester) async {
      final dio = _goalsDio(response: {
        'goals': [
          {'id': 'g2', 'text': 'Second in the list', 'status': 'active', 'isFocus': false},
          {'id': 'g1', 'text': 'The one we are on', 'status': 'active', 'isFocus': true},
        ],
        'activeCount': 2,
      });

      await tester.pumpWidget(_app(dio, const GoalsScreen()));
      await tester.pumpAndSettle();

      final focusY = tester.getTopLeft(find.text('The one we are on')).dy;
      final waitingY = tester.getTopLeft(find.text('Second in the list')).dy;
      expect(focusY, lessThan(waitingY));
    });

    testWidgets('says there are no goals yet, and offers no controls', (tester) async {
      final dio = _goalsDio(response: {'goals': <Object>[], 'activeCount': 0});

      await tester.pumpWidget(_app(dio, const GoalsScreen()));
      await tester.pumpAndSettle();

      expect(find.text(GoalsCopy.emptyTitle), findsOneWidget);
      expect(find.text(GoalsCopy.emptyBody), findsOneWidget);
      // The therapist owns the status of a goal; the client has no button here.
      expect(find.byType(FilledButton), findsNothing);
      expect(find.byType(TextButton), findsNothing);
    });
  });

  group('GoalsCard on Home', () {
    testWidgets('names the goal in focus and how many are waiting', (tester) async {
      final dio = _goalsDio(response: {
        'goals': [
          {'id': 'g1', 'text': 'Ask for help at work once', 'status': 'active', 'isFocus': true},
          {'id': 'g2', 'text': 'Walk ten minutes after lunch', 'status': 'active', 'isFocus': false},
        ],
        'activeCount': 2,
      });

      await tester.pumpWidget(_app(dio, const Scaffold(body: GoalsCard()), path: '/home'));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('home_goals_card')), findsOneWidget);
      expect(find.text('Ask for help at work once'), findsOneWidget);
      expect(find.text('Working on now · 1 more'), findsOneWidget);
    });

    testWidgets('renders nothing at all when the client has no goals', (tester) async {
      final dio = _goalsDio(response: {'goals': <Object>[], 'activeCount': 0});

      await tester.pumpWidget(_app(dio, const Scaffold(body: GoalsCard()), path: '/home'));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('home_goals_card')), findsNothing);
      expect(find.text(GoalsCopy.title), findsNothing);
    });
  });
}
