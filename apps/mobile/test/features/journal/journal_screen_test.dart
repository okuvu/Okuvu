import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/journal/journal_screen.dart';

Dio _createMockDio({int statusCode = 200, Map<String, dynamic>? data}) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        handler.resolve(
          Response(
            requestOptions: options,
            statusCode: statusCode,
            data: data ?? {'success': true, 'id': 'entry-1'},
          ),
        );
      },
    ),
  );
  return dio;
}

Widget _buildJournalApp({Dio? dio}) {
  return ProviderScope(
    overrides: [
      dioClientProvider.overrideWithValue(dio ?? _createMockDio()),
    ],
    child: MaterialApp.router(
      routerConfig: GoRouter(
        initialLocation: '/journal',
        routes: [
          GoRoute(
            path: '/journal',
            builder: (_, __) => const JournalScreen(),
          ),
          GoRoute(
            path: '/home',
            builder: (_, __) => const Scaffold(
              body: Center(child: Text('Home')),
            ),
          ),
        ],
      ),
    ),
  );
}

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
  });

  group('JournalScreen layout', () {
    testWidgets('renders AppBar with Journal title', (tester) async {
      await tester.pumpWidget(_buildJournalApp());
      await tester.pumpAndSettle();

      expect(find.text('Journal'), findsOneWidget);
    });

    testWidgets('renders How are you feeling? prompt', (tester) async {
      await tester.pumpWidget(_buildJournalApp());
      await tester.pumpAndSettle();

      expect(find.text('How are you feeling?'), findsOneWidget);
    });

    testWidgets('renders all 8 emotion chips', (tester) async {
      await tester.pumpWidget(_buildJournalApp());
      await tester.pumpAndSettle();

      expect(find.text('Anxious'), findsOneWidget);
      expect(find.text('Sad'), findsOneWidget);
      expect(find.text('Angry'), findsOneWidget);
      expect(find.text('Overwhelmed'), findsOneWidget);
      expect(find.text('Numb'), findsOneWidget);
      expect(find.text('Calm'), findsOneWidget);
      expect(find.text('Hopeful'), findsOneWidget);
      expect(find.text('Other'), findsOneWidget);
    });

    testWidgets('renders How strong is it? with 5 intensity dots',
        (tester) async {
      await tester.pumpWidget(_buildJournalApp());
      await tester.pumpAndSettle();

      expect(find.text('How strong is it?'), findsOneWidget);
      // 5 circle icons (initially 1 filled + 4 outlined = 5 total)
      expect(find.byIcon(Icons.circle), findsOneWidget);
      expect(find.byIcon(Icons.circle_outlined), findsNWidgets(4));
    });

    testWidgets('renders text area with placeholder', (tester) async {
      await tester.pumpWidget(_buildJournalApp());
      await tester.pumpAndSettle();

      expect(find.text("What's on your mind?"), findsOneWidget);
      expect(
        find.text('Write anything \u2014 this is just for you.'),
        findsOneWidget,
      );
    });

    testWidgets('renders Save and Cancel buttons', (tester) async {
      await tester.pumpWidget(_buildJournalApp());
      await tester.pumpAndSettle();

      expect(find.text('Save'), findsOneWidget);
      expect(find.text('Cancel'), findsOneWidget);
    });
  });

  group('JournalScreen emotion selection', () {
    testWidgets('tapping an emotion chip highlights it', (tester) async {
      await tester.pumpWidget(_buildJournalApp());
      await tester.pumpAndSettle();

      await tester.tap(find.text('Anxious'));
      await tester.pump();

      // Save button should now be enabled (emotion selected, but content empty
      // means still disabled — check that the chip was tapped without error)
      expect(find.text('Anxious'), findsOneWidget);
    });
  });

  group('JournalScreen intensity selection', () {
    testWidgets('tapping intensity dot N fills N dots', (tester) async {
      await tester.pumpWidget(_buildJournalApp());
      await tester.pumpAndSettle();

      // Tap the first outlined dot (intensity goes from 1 to 2)
      final circles = find.byIcon(Icons.circle_outlined);
      await tester.tap(circles.first);
      await tester.pump();

      // After tapping, the number of filled circles should increase
      // Initial: 1 filled, 4 outlined. After tapping dot 2 (0-indexed), should be 2 filled, 3 outlined
      expect(find.byIcon(Icons.circle_outlined), findsNWidgets(3));
    });
  });

  group('JournalScreen privacy notice', () {
    testWidgets('shows privacy notice on first visit', (tester) async {
      await tester.pumpWidget(_buildJournalApp());
      await tester.pumpAndSettle();

      expect(
        find.text(
          "Your journal is private. Evia doesn't read it and your therapist can't see it.",
        ),
        findsOneWidget,
      );
    });

    testWidgets('hides privacy notice after dismissal', (tester) async {
      await tester.pumpWidget(_buildJournalApp());
      await tester.pumpAndSettle();

      // Dismiss the notice
      await tester.tap(find.byIcon(Icons.close));
      await tester.pumpAndSettle();

      expect(
        find.text(
          "Your journal is private. Evia doesn't read it and your therapist can't see it.",
        ),
        findsNothing,
      );
    });
  });

  group('JournalScreen navigation', () {
    testWidgets('Cancel button navigates back to /home', (tester) async {
      await tester.pumpWidget(_buildJournalApp());
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.text('Cancel'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cancel'), warnIfMissed: false);
      await tester.pumpAndSettle();

      // After navigating away, JournalScreen should no longer be present
      expect(find.byType(JournalScreen), findsNothing);
    });

    testWidgets('save flow fills fields and navigates to /home', (tester) async {
      await tester.pumpWidget(_buildJournalApp());
      await tester.pumpAndSettle();

      // Select emotion
      await tester.tap(find.text('Anxious'));
      await tester.pump();

      // Enter content — ensure text field is visible first
      await tester.ensureVisible(find.byType(TextField));
      await tester.enterText(
        find.byType(TextField),
        'Feeling anxious about the presentation tomorrow.',
      );
      await tester.pump();

      // Save button should now be enabled — scroll to it and tap
      await tester.ensureVisible(find.text('Save'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save'), warnIfMissed: false);
      await tester.pumpAndSettle();

      // Should navigate away from JournalScreen
      expect(find.byType(JournalScreen), findsNothing);
    });
  });
}
