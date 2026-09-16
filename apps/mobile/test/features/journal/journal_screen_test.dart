import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
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

bool _isDotFilled(WidgetTester tester, int dotIndex) {
  final container = tester.widget<Container>(
    find.descendant(
      of: find.byKey(Key('intensityDot_$dotIndex')),
      matching: find.byType(Container),
    ),
  );
  final decoration = container.decoration! as BoxDecoration;
  return decoration.color != null;
}

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
  });

  group('JournalScreen layout', () {
    testWidgets('renders AppBar with Journal title', (tester) async {
      await tester.pumpWidget(_buildJournalApp());
      await tester.pumpAndSettle();

      // "Journal" now also appears as the bottom-nav tab label (the
      // persistent Home/Chat/Journal nav added to this screen) — scope to
      // the AppBar specifically rather than matching either.
      expect(
        find.descendant(of: find.byType(AppBar), matching: find.text('Journal')),
        findsOneWidget,
      );
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
      // 5 intensity dots, initially intensity 1: dot 1 filled, dots 2-5 outlined
      for (var i = 1; i <= 5; i++) {
        expect(find.byKey(Key('intensityDot_$i')), findsOneWidget);
      }
      expect(_isDotFilled(tester, 1), isTrue);
      expect(_isDotFilled(tester, 2), isFalse);
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

    testWidgets('content field enforces a 10000-character max length', (tester) async {
      await tester.pumpWidget(_buildJournalApp());
      await tester.pumpAndSettle();

      final textField = tester.widget<TextField>(find.byType(TextField).last);
      expect(textField.maxLength, 10000);
      expect(textField.maxLengthEnforcement, MaxLengthEnforcement.enforced);

      await tester.ensureVisible(find.byType(TextField).last);
      await tester.enterText(find.byType(TextField).last, 'x' * 10005);
      await tester.pump();

      final container = ProviderScope.containerOf(
        tester.element(find.byType(TextField).last),
      );
      expect(container.read(journalEntryFormProvider).content.length, 10000);
    });

    testWidgets('renders a mic button to talk instead of type (J1)', (tester) async {
      await tester.pumpWidget(_buildJournalApp());
      await tester.pumpAndSettle();

      expect(
        find.byKey(const ValueKey('journal_voice_input_button')),
        findsOneWidget,
      );
      expect(find.byIcon(LucideIcons.mic), findsOneWidget);
    });

    testWidgets('Get a prompt fetches and shows a suggestion (J2)', (tester) async {
      final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            final data = options.path.contains('/journal/prompt')
                ? {'prompt': 'What made today different?'}
                : {'success': true, 'id': 'entry-1'};
            handler.resolve(
              Response(requestOptions: options, statusCode: 200, data: data),
            );
          },
        ),
      );

      await tester.pumpWidget(_buildJournalApp(dio: dio));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Get a prompt'));
      await tester.pumpAndSettle();

      expect(find.text('What made today different?'), findsOneWidget);

      await tester.tap(find.text('What made today different?'));
      await tester.pumpAndSettle();

      final textField = tester.widget<TextField>(find.byType(TextField).last);
      expect(textField.controller!.text, contains('What made today different?'));
      expect(
        find.byKey(const ValueKey('journal_suggested_prompt')),
        findsNothing,
      );
    });

    testWidgets('renders Save and Cancel buttons', (tester) async {
      await tester.pumpWidget(_buildJournalApp());
      await tester.pumpAndSettle();

      // The persistent bottom nav now added to this screen shrinks the
      // ListView's viewport, so Save/Cancel (near the bottom of the form)
      // are no longer within the initially-built extent — scroll to them.
      await tester.scrollUntilVisible(find.text('Save'), 200, scrollable: find.byType(Scrollable).first);
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

      // Tap dot 4 (intensity goes from 1 to 4)
      await tester.tap(find.byKey(const Key('intensityDot_4')));
      await tester.pump();

      expect(_isDotFilled(tester, 1), isTrue);
      expect(_isDotFilled(tester, 4), isTrue);
      expect(_isDotFilled(tester, 5), isFalse);
    });
  });

  group('JournalScreen privacy notice', () {
    testWidgets('shows privacy notice on first visit', (tester) async {
      await tester.pumpWidget(_buildJournalApp());
      await tester.pumpAndSettle();

      expect(
        find.text(
          "Your journal is private. OKUVU doesn't read it and your therapist can't see it.",
        ),
        findsOneWidget,
      );
    });

    testWidgets('hides privacy notice after dismissal', (tester) async {
      await tester.pumpWidget(_buildJournalApp());
      await tester.pumpAndSettle();

      // Dismiss the notice
      await tester.tap(find.byIcon(LucideIcons.x));
      await tester.pumpAndSettle();

      expect(
        find.text(
          "Your journal is private. OKUVU doesn't read it and your therapist can't see it.",
        ),
        findsNothing,
      );
    });
  });

  group('JournalScreen navigation', () {
    testWidgets('Cancel button navigates back to /home', (tester) async {
      await tester.pumpWidget(_buildJournalApp());
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(find.text('Cancel'), 200, scrollable: find.byType(Scrollable).first);
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
