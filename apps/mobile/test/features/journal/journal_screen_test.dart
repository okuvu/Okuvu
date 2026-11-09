import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/journal/journal_entry.dart';
import 'package:okuvu/src/features/journal/journal_prompt_service.dart';
import 'package:okuvu/src/features/journal/journal_screen.dart';
import 'package:okuvu/src/theme/app_colors.dart';

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

Widget _buildJournalApp(WidgetTester tester, {Dio? dio}) {
  // Give the form one tall screen instead of the 800x600 test default. The
  // form is a single scrolling page and a lazily-built ListView never builds
  // children far below the fold, so the text box simply did not exist for the
  // finders. Mood chips and strength dots are now thumb-sized, which is what
  // pushed it under the old build extent.
  tester.view.physicalSize = const Size(2400, 4200);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.reset);

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
      await tester.pumpWidget(_buildJournalApp(tester, ));
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
      await tester.pumpWidget(_buildJournalApp(tester, ));
      await tester.pumpAndSettle();

      // "(optional)" is the visible answer to the reported complaint that a
      // mood looked mandatory.
      expect(find.text('How are you feeling? (optional)'), findsOneWidget);
    });

    testWidgets('renders all 8 emotion chips', (tester) async {
      await tester.pumpWidget(_buildJournalApp(tester, ));
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
      await tester.pumpWidget(_buildJournalApp(tester, ));
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
      await tester.pumpWidget(_buildJournalApp(tester, ));
      await tester.pumpAndSettle();

      expect(find.text("What's on your mind?"), findsOneWidget);
      expect(
        find.text('Write anything \u2014 this is just for you.'),
        findsOneWidget,
      );
    });

    testWidgets('content field enforces a 10000-character max length', (tester) async {
      await tester.pumpWidget(_buildJournalApp(tester, ));
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
      await tester.pumpWidget(_buildJournalApp(tester, ));
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

      await tester.pumpWidget(_buildJournalApp(tester, dio: dio));
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

      await tester.pumpWidget(_buildJournalApp(tester, dio: dio));
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

      await tester.pumpWidget(_buildJournalApp(tester, dio: dio));
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
      await tester.pumpWidget(_buildJournalApp(tester, ));
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
    // The reported defect: "I am unable to click on them to select." A real tap
    // does reach the handler (the previous version of this test proved nothing
    // — it only checked the label was still on screen), but the chip answered
    // it with a change of about one shade, so the screen looked dead. These
    // tests assert what the client can actually see.
    BoxDecoration chipDecoration(WidgetTester tester, String emotion) {
      final container = tester.widget<AnimatedContainer>(
        find.descendant(
          of: find.byKey(Key('emotionChip_$emotion')),
          matching: find.byType(AnimatedContainer),
        ),
      );
      return container.decoration! as BoxDecoration;
    }

    testWidgets('tapping a chip selects it — state and visible marker',
        (tester) async {
      await tester.pumpWidget(_buildJournalApp(tester, ));
      await tester.pumpAndSettle();

      final container = ProviderScope.containerOf(
        tester.element(find.byType(JournalScreen)),
      );
      expect(container.read(journalEntryFormProvider).emotion, isNull);
      expect(
        find.descendant(
          of: find.byKey(const Key('emotionChip_anxious')),
          matching: find.byIcon(LucideIcons.check),
        ),
        findsNothing,
      );

      await tester.tap(find.byKey(const Key('emotionChip_anxious')));
      await tester.pumpAndSettle();

      expect(container.read(journalEntryFormProvider).emotion, 'anxious');
      // A tick appears inside the chosen chip and its border thickens to the
      // brand violet — the two cues that make the tap unmistakable.
      expect(
        find.descendant(
          of: find.byKey(const Key('emotionChip_anxious')),
          matching: find.byIcon(LucideIcons.check),
        ),
        findsOneWidget,
      );
      final border = chipDecoration(tester, 'anxious').border! as Border;
      expect(border.top.color, AppColors.violet);
      expect(border.top.width, 2);

      // The others stay plain.
      final unselected = chipDecoration(tester, 'sad').border! as Border;
      expect(unselected.top.color, AppColors.hairline);
      expect(unselected.top.width, 1);
    });

    testWidgets('tapping the chosen chip again clears it, strength included',
        (tester) async {
      await tester.pumpWidget(_buildJournalApp(tester, ));
      await tester.pumpAndSettle();

      final container = ProviderScope.containerOf(
        tester.element(find.byType(JournalScreen)),
      );

      await tester.tap(find.byKey(const Key('emotionChip_anxious')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('intensityDot_4')));
      await tester.pumpAndSettle();
      expect(container.read(journalEntryFormProvider).intensity, 4);

      await tester.tap(find.byKey(const Key('emotionChip_anxious')));
      await tester.pumpAndSettle();

      final state = container.read(journalEntryFormProvider);
      expect(state.emotion, isNull);
      // A strength with no feeling is not an answer — the dots must not stay
      // filled under a chip that is no longer selected.
      expect(state.intensity, 0);
      expect(_isDotFilled(tester, 1), isFalse);
    });

    testWidgets('picking a second chip moves the selection, never doubles it',
        (tester) async {
      await tester.pumpWidget(_buildJournalApp(tester, ));
      await tester.pumpAndSettle();

      final container = ProviderScope.containerOf(
        tester.element(find.byType(JournalScreen)),
      );

      await tester.tap(find.byKey(const Key('emotionChip_anxious')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('emotionChip_calm')));
      await tester.pumpAndSettle();

      expect(container.read(journalEntryFormProvider).emotion, 'calm');
      expect(
        find.descendant(
          of: find.byKey(const Key('emotionChip_calm')),
          matching: find.byIcon(LucideIcons.check),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byKey(const Key('emotionChip_anxious')),
          matching: find.byIcon(LucideIcons.check),
        ),
        findsNothing,
      );
    });

    testWidgets('Clear appears only once a mood is picked and resets both',
        (tester) async {
      await tester.pumpWidget(_buildJournalApp(tester, ));
      await tester.pumpAndSettle();

      final container = ProviderScope.containerOf(
        tester.element(find.byType(JournalScreen)),
      );
      expect(
        find.byKey(const ValueKey('journal_clear_mood_button')),
        findsNothing,
      );

      await tester.tap(find.byKey(const Key('emotionChip_sad')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('intensityDot_5')));
      await tester.pumpAndSettle();

      final clear = find.byKey(const ValueKey('journal_clear_mood_button'));
      expect(clear, findsOneWidget);

      await tester.tap(clear);
      await tester.pumpAndSettle();

      final state = container.read(journalEntryFormProvider);
      expect(state.emotion, isNull);
      expect(state.intensity, 0);
      expect(clear, findsNothing);
    });

    testWidgets('every chip and dot is thumb-sized (at least 48px tall)',
        (tester) async {
      await tester.pumpWidget(_buildJournalApp(tester, ));
      await tester.pumpAndSettle();

      for (final emotion in journalEmotions) {
        final size = tester.getSize(find.byKey(Key('emotionChip_$emotion')));
        expect(size.height, greaterThanOrEqualTo(48), reason: emotion);
      }
      for (var i = 1; i <= 5; i++) {
        final size = tester.getSize(find.byKey(Key('intensityDot_$i')));
        expect(size.width, greaterThanOrEqualTo(48), reason: 'dot $i');
        expect(size.height, greaterThanOrEqualTo(48), reason: 'dot $i');
      }
    });

    testWidgets('typing does not wipe the chosen mood', (tester) async {
      await tester.pumpWidget(_buildJournalApp(tester, ));
      await tester.pumpAndSettle();

      final container = ProviderScope.containerOf(
        tester.element(find.byType(JournalScreen)),
      );

      await tester.tap(find.byKey(const Key('emotionChip_hopeful')));
      await tester.pumpAndSettle();

      final field = find.byType(TextField).last;
      await tester.ensureVisible(field);
      await tester.enterText(field, 'Small win today.');
      await tester.pumpAndSettle();

      expect(container.read(journalEntryFormProvider).emotion, 'hopeful');
      expect(
        find.descendant(
          of: find.byKey(const Key('emotionChip_hopeful')),
          matching: find.byIcon(LucideIcons.check),
        ),
        findsOneWidget,
      );
    });
  });

  group('JournalScreen intensity selection', () {
    testWidgets('tapping intensity dot N fills N dots', (tester) async {
      await tester.pumpWidget(_buildJournalApp(tester, ));
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
      await tester.pumpWidget(_buildJournalApp(tester, ));
      await tester.pumpAndSettle();

      // Step 4 replaced the old notice ("OKUVU doesn't read it...") with the
      // owner-approved privacy line, because the entry is now screened for
      // safety: the promise changed from "nobody reads this" to "nobody reads
      // this unless you share it, and danger raises help without the words".
      expect(
        find.text(
          "Your therapist can't read this unless you choose to share it. "
          "If OKUVU's safety system notices you may be in danger, it will show "
          "you help straight away and let your therapist know you may need "
          "support, without sharing what you wrote.",
        ),
        findsOneWidget,
      );
    });

    testWidgets('hides privacy notice after dismissal', (tester) async {
      await tester.pumpWidget(_buildJournalApp(tester, ));
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
      await tester.pumpWidget(_buildJournalApp(tester, ));
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(find.text('Cancel'), 200, scrollable: find.byType(Scrollable).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cancel'), warnIfMissed: false);
      await tester.pumpAndSettle();

      // After navigating away, JournalScreen should no longer be present
      expect(find.byType(JournalScreen), findsNothing);
    });

    testWidgets('save flow fills fields and navigates to /home', (tester) async {
      await tester.pumpWidget(_buildJournalApp(tester, ));
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

      await tester.pumpWidget(_buildJournalApp(tester, dio: dio));
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
