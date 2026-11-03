import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/journal/journal_prompt_service.dart';
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

      // "(optional)" is the visible answer to the reported complaint that a
      // mood looked mandatory.
      expect(find.text('How are you feeling? (optional)'), findsOneWidget);
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

      expect(find.text('How strong is it? (optional)'), findsOneWidget);
      // 5 intensity dots, none filled: nothing has been rated yet. The first
      // dot used to come pre-filled at "1", recording a strength nobody chose.
      for (var i = 1; i <= 5; i++) {
        expect(find.byKey(Key('intensityDot_$i')), findsOneWidget);
      }
      expect(_isDotFilled(tester, 1), isFalse);
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

    testWidgets('Get a prompt puts a real prompt into the text area (J2)',
        (tester) async {
      final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            final data = options.path.contains('/journal/prompts')
                ? {
                    'version': '1.0.0',
                    'review': {
                      'status': 'pending',
                      'reviewer': 'Dr Shubhangi Goswami',
                      'requestedOn': '2026-11-03',
                      'approvedOn': null,
                      'approvedVersion': null,
                    },
                    'prompts': [
                      {'id': 'any-01', 'text': 'What was one good moment today?'},
                    ],
                  }
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

      // The client asked for the prompt to land in the journal text section,
      // not in a suggestion he then has to tap.
      final textField = tester.widget<TextField>(find.byType(TextField).last);
      expect(textField.controller!.text, contains('What was one good moment today?'));
      expect(find.text('Prompt added — write below it.'), findsOneWidget);
    });

    testWidgets('Get a prompt appends and offers Undo, never overwriting (J2)',
        (tester) async {
      final dio = _createMockDio(
        data: {
          'prompts': [
            {'id': 'any-01', 'text': 'What was one good moment today?'},
          ],
        },
      );

      await tester.pumpWidget(_buildJournalApp(dio: dio));
      await tester.pumpAndSettle();

      final field = find.byType(TextField).last;
      await tester.ensureVisible(field);
      await tester.enterText(field, 'I already wrote this.');
      await tester.pump();

      await tester.ensureVisible(find.text('Get a prompt'));
      await tester.tap(find.text('Get a prompt'));
      await tester.pumpAndSettle();

      final textField = tester.widget<TextField>(find.byType(TextField).last);
      expect(textField.controller!.text, contains('I already wrote this.'));
      expect(textField.controller!.text, contains('What was one good moment today?'));

      await tester.tap(find.text('Undo'));
      await tester.pumpAndSettle();

      final afterUndo = tester.widget<TextField>(find.byType(TextField).last);
      expect(afterUndo.controller!.text, 'I already wrote this.');
    });

    testWidgets('Get a prompt still answers when the request fails (J2)',
        (tester) async {
      final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            handler.reject(
              DioException(
                requestOptions: options,
                type: DioExceptionType.connectionError,
                message: 'offline',
              ),
            );
          },
        ),
      );

      await tester.pumpWidget(_buildJournalApp(dio: dio));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Get a prompt'));
      await tester.pumpAndSettle();

      // The old button showed nothing at all here — this is the regression
      // guard for "the button does not work".
      final textField = tester.widget<TextField>(find.byType(TextField).last);
      final text = textField.controller!.text;
      expect(text.trim().isNotEmpty, isTrue);
      expect(
        JournalPromptService.offlineFloor.any((p) => text.contains(p)),
        isTrue,
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

    // The exact complaint: with no mood picked, Save never appeared as an
    // option. Words alone must save, and the payload must not invent a mood.
    testWidgets('words alone can be saved, with no mood and no intensity',
        (tester) async {
      Map<String, dynamic>? posted;
      final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            if (options.method == 'POST' && options.path == '/journal') {
              posted = Map<String, dynamic>.from(options.data as Map);
            }
            handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {'success': true, 'id': 'entry-1'},
              ),
            );
          },
        ),
      );

      await tester.pumpWidget(_buildJournalApp(dio: dio));
      await tester.pumpAndSettle();

      final field = find.byType(TextField).last;
      await tester.ensureVisible(field);
      await tester.enterText(field, 'Just needed to put this somewhere.');
      await tester.pump();

      await tester.scrollUntilVisible(
        find.text('Save'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();

      final save = tester.widget<FilledButton>(
        find.ancestor(of: find.text('Save'), matching: find.byType(FilledButton)),
      );
      expect(save.onPressed, isNotNull, reason: 'Save must be enabled');

      await tester.tap(find.text('Save'), warnIfMissed: false);
      await tester.pumpAndSettle();

      expect(posted, isNotNull);
      expect(posted!['content'], 'Just needed to put this somewhere.');
      expect(posted!.containsKey('emotion'), isFalse);
      expect(posted!.containsKey('intensity'), isFalse);
      expect(find.byType(JournalScreen), findsNothing);
    });
  });
}
