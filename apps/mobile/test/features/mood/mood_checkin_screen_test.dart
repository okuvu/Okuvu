import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:okuvu/src/config/app_config.dart';
import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/mood/mood_checkin_screen.dart';

/// The mood check-in screen: faces, optional words, optional strength, the
/// gentle card, "Your week", and the per-check-in share switch.
///
/// Two things these tests deliberately pin as text rather than as constants:
/// the gentle card's sentence and its three buttons, because they are the
/// owner's approved copy and a paraphrase is a different promise.

const String _gentleLine =
    "That sounds really heavy. You don't have to sit with this alone. Would you like some support right now?";

String _two(int value) => value.toString().padLeft(2, '0');

/// A `YYYY-MM-DD` IST date `days` days before today.
String _dateMinus(int days) {
  final ist = DateTime.now().toUtc().add(const Duration(hours: 5, minutes: 30));
  final date = DateTime.utc(ist.year, ist.month, ist.day).subtract(Duration(days: days));
  return '${date.year}-${_two(date.month)}-${_two(date.day)}';
}

Map<String, dynamic> _entry({
  String id = 'mood_1',
  String? date,
  int moodValue = 3,
  List<String> words = const [],
  String? other,
  int? strength,
  bool shared = false,
}) =>
    {
      'id': id,
      'date': date ?? _dateMinus(0),
      'mood_value': moodValue,
      'moodLabel': const {1: 'Awful', 2: 'Low', 3: 'Okay', 4: 'Good', 5: 'Great'}[moodValue],
      'feeling_words': words,
      'feeling_other': other,
      'strength_1_5': strength,
      'shared': shared,
      'shareLabel': shared ? 'Shared with my therapist' : 'Private',
    };

class _Harness {
  _Harness({List<Map<String, dynamic>>? entries}) : entries = entries ?? const [] {
    dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        handler.resolve(await _handle(options));
        return;
      },
    ));
    container = ProviderContainer(overrides: [dioClientProvider.overrideWithValue(dio)]);
  }

  final List<Map<String, dynamic>> entries;

  late final Dio dio;
  late final ProviderContainer container;

  final List<Map<String, dynamic>> savedCheckins = [];
  final List<Map<String, dynamic>> shares = [];

  Future<Response<dynamic>> _handle(RequestOptions options) async {
    if (options.method == 'GET' && options.path == '/progress/mood') {
      return Response(
        requestOptions: options,
        statusCode: 200,
        data: {'entries': entries},
      );
    }
    if (options.method == 'POST' && options.path == '/progress/mood/checkin') {
      savedCheckins.add(Map<String, dynamic>.from(options.data as Map));
      return Response(
        requestOptions: options,
        statusCode: 200,
        data: {
          'success': true,
          'id': 'mood_new',
          'date': _dateMinus(0),
          'mood_value': (options.data as Map)['mood_value'],
          'shared': false,
          'shareLabel': 'Private',
          'safety': {'showHelp': false, 'helpOffer': false},
        },
      );
    }
    if (options.method == 'POST' && options.path == '/sharing') {
      shares.add(Map<String, dynamic>.from(options.data as Map));
      return Response(
        requestOptions: options,
        statusCode: 200,
        data: {
          'kind': 'mood_log',
          'id': (options.data as Map)['id'],
          'shared': (options.data as Map)['shared'],
          'sharedAt': null,
          'unsharedAt': null,
          'label': 'Shared with my therapist',
        },
      );
    }
    return Response(requestOptions: options, statusCode: 200, data: {'success': true});
  }

  Widget app() => UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: MoodCheckinScreen()),
      );
}

/// Pumps the screen on a tall surface, so the whole form and the list below it
/// are built in one pass (`ListView` builds lazily, and a widget below the fold
/// is a widget `find.byKey` cannot see).
Future<void> _pump(WidgetTester tester, _Harness harness) async {
  tester.view.physicalSize = const Size(1200, 3000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(harness.app());
  await tester.pumpAndSettle();
}

void main() {
  AppConfig.init('dev');

  testWidgets('shows the five faces with their words and keeps Save off until one is tapped',
      (tester) async {
    final harness = _Harness();
    await _pump(tester, harness);

    for (final label in ['Awful', 'Low', 'Okay', 'Good', 'Great']) {
      expect(find.text(label), findsOneWidget);
    }
    // Step 1 is required: nothing to save before a face is chosen.
    expect(find.byKey(const Key('mood_save')), findsNothing);

    await tester.tap(find.byKey(const Key('mood_face_3')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('mood_save')), findsOneWidget);
  });

  testWidgets('saves the face, the chosen words, "Something else" and the strength',
      (tester) async {
    final harness = _Harness();
    await _pump(tester, harness);

    await tester.tap(find.byKey(const Key('mood_face_2')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('mood_word_sad')));
    await tester.tap(find.byKey(const Key('mood_word_tired')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('mood_something_else')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('mood_other_field')), 'worn thin');
    await tester.pumpAndSettle();

    // Slide to the far right: the top of the 1-5 scale.
    await tester.drag(find.byKey(const Key('mood_strength')), const Offset(900, 0));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('mood_save')));
    await tester.pumpAndSettle();

    expect(harness.savedCheckins, hasLength(1));
    final body = harness.savedCheckins.single;
    expect(body['mood_value'], 2);
    expect(body['feeling_words'], ['sad', 'tired']);
    expect(body['feeling_other'], 'worn thin');
    expect(body['strength_1_5'], 5);
  });

  testWidgets('an untouched slider sends no strength at all', (tester) async {
    final harness = _Harness();
    await _pump(tester, harness);

    await tester.tap(find.byKey(const Key('mood_face_4')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('mood_save')));
    await tester.pumpAndSettle();

    expect(harness.savedCheckins.single.containsKey('strength_1_5'), isFalse);
  });

  testWidgets('Skip is a real skip: no words and no "Something else" are sent',
      (tester) async {
    final harness = _Harness();
    await _pump(tester, harness);

    await tester.tap(find.byKey(const Key('mood_face_1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('mood_word_sad')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('mood_words_skip')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('mood_word_sad')), findsNothing);
    expect(find.byKey(const Key('mood_words_skipped')), findsOneWidget);

    // And the client can bring the words back before saving.
    await tester.tap(find.byKey(const Key('mood_words_add')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('mood_word_sad')), findsOneWidget);

    await tester.tap(find.byKey(const Key('mood_words_skip')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('mood_save')));
    await tester.pumpAndSettle();

    expect(harness.savedCheckins.single['feeling_words'], isEmpty);
    expect(harness.savedCheckins.single.containsKey('feeling_other'), isFalse);
  });

  testWidgets('stops at three words', (tester) async {
    final harness = _Harness();
    await _pump(tester, harness);

    await tester.tap(find.byKey(const Key('mood_face_3')));
    await tester.pumpAndSettle();

    for (final word in ['sad', 'tired', 'lonely']) {
      await tester.tap(find.byKey(Key('mood_word_$word')));
      await tester.pumpAndSettle();
    }
    await tester.tap(find.byKey(const Key('mood_word_numb')));
    await tester.pumpAndSettle();

    expect(find.text('You can pick up to 3 words.'), findsOneWidget);
    final chip = tester.widget<FilterChip>(find.byKey(const Key('mood_word_numb')));
    expect(chip.selected, isFalse);

    await tester.tap(find.byKey(const Key('mood_save')));
    await tester.pumpAndSettle();
    expect(harness.savedCheckins.single['feeling_words'], ['sad', 'tired', 'lonely']);
  });

  testWidgets('choosing hopeless or numb shows the gentle card after the save',
      (tester) async {
    final harness = _Harness();
    await _pump(tester, harness);

    await tester.tap(find.byKey(const Key('mood_face_1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('mood_word_hopeless')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('gentle_support_card')), findsNothing);

    await tester.tap(find.byKey(const Key('mood_save')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('gentle_support_card')), findsOneWidget);
    expect(find.text(_gentleLine), findsOneWidget);
    expect(find.text('Talk in chat'), findsOneWidget);
    expect(find.text('See support lines'), findsOneWidget);
    expect(find.text('Not now'), findsOneWidget);
  });

  testWidgets('the gentle card is not shown for any other word', (tester) async {
    final harness = _Harness();
    await _pump(tester, harness);

    await tester.tap(find.byKey(const Key('mood_face_2')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('mood_word_sad')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('mood_save')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('gentle_support_card')), findsNothing);
  });

  testWidgets('"Not now" closes the card and "See support lines" opens the existing helplines',
      (tester) async {
    final harness = _Harness();
    await _pump(tester, harness);

    await tester.tap(find.byKey(const Key('mood_face_1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('mood_word_numb')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('mood_save')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('gentle_not_now')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('gentle_support_card')), findsNothing);

    // Save again to bring it back, then take the support-lines path.
    await tester.tap(find.byKey(const Key('mood_face_1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('mood_word_numb')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('mood_save')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('gentle_support')));
    await tester.pumpAndSettle();

    expect(harness.container.read(crisisOverlayProvider), isTrue);
  });

  testWidgets('"Your week" counts the faces and names the three most-chosen words',
      (tester) async {
    final harness = _Harness(entries: [
      _entry(id: 'm1', date: _dateMinus(0), moodValue: 3, words: ['tired', 'calm']),
      _entry(id: 'm2', date: _dateMinus(1), moodValue: 3, words: ['tired', 'sad']),
      _entry(id: 'm3', date: _dateMinus(2), moodValue: 4, words: ['calm']),
      // Outside the seven-day window: it must not be counted.
      _entry(id: 'm4', date: _dateMinus(9), moodValue: 1, words: ['angry']),
    ]);

    await _pump(tester, harness);

    expect(find.byKey(const Key('mood_week_card')), findsOneWidget);
    expect(
      find.text('This week you felt tired, calm and sad most often.'),
      findsOneWidget,
    );
    expect(
      tester.widget<Text>(find.byKey(const Key('mood_week_count_3'))).data,
      '2',
    );
    expect(
      tester.widget<Text>(find.byKey(const Key('mood_week_count_4'))).data,
      '1',
    );
    // Nothing from outside the window, and no word from it either.
    expect(
      tester.widget<Text>(find.byKey(const Key('mood_week_count_1'))).data,
      '0',
    );
    expect(
      tester.widget<Text>(find.byKey(const Key('mood_week_sentence'))).data,
      isNot(contains('angry')),
    );
  });

  testWidgets('a check-in starts private and its switch asks before sharing',
      (tester) async {
    // The first-share notice is stored in preferences. Without this the
    // platform channel never answers in a widget test and the switch waits on
    // it forever.
    SharedPreferences.setMockInitialValues({});
    final harness = _Harness(entries: [
      _entry(id: 'mood_1', moodValue: 2, words: ['tired'], strength: 4),
    ]);

    await _pump(tester, harness);

    expect(find.text('Private'), findsOneWidget);
    expect(find.text('Strength 4 of 5'), findsOneWidget);

    await tester.tap(find.byKey(const Key('mood_share_mood_1')));
    await tester.pumpAndSettle();

    // The approved first-share notice, and no write until it is confirmed.
    expect(find.text('Share this'), findsOneWidget);
    expect(harness.shares, isEmpty);

    await tester.tap(find.widgetWithText(FilledButton, 'Share'));
    await tester.pumpAndSettle();

    expect(harness.shares, hasLength(1));
    expect(harness.shares.single, {'kind': 'mood_log', 'id': 'mood_1', 'shared': true});
  });
}
