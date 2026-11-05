import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/chat/widgets/guided_breathing_card.dart';
import 'package:okuvu/src/features/chat/widgets/tool_card_widget.dart';
import 'package:okuvu/src/features/home/breathing_screen.dart';

class _RecordingDio {
  final List<RequestOptions> requests = [];
  final Map<String, dynamic> todayBody;

  _RecordingDio(this.todayBody);

  Dio build() {
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          requests.add(options);
          if (options.method == 'GET' && options.path == '/users/me/today') {
            handler.resolve(Response(requestOptions: options, statusCode: 200, data: todayBody));
            return;
          }
          handler.resolve(Response(requestOptions: options, statusCode: 200, data: {'success': true}));
        },
      ),
    );
    return dio;
  }
}

Widget _buildApp(Dio dio) {
  return ProviderScope(
    overrides: [dioClientProvider.overrideWithValue(dio)],
    child: const MaterialApp(home: BreathingScreen()),
  );
}

Map<String, dynamic> _today({
  List<Map<String, dynamic>> assigned = const [],
  Map<String, dynamic> paces = const {},
}) =>
    {
      'reminders': const [],
      'assignedExercises': assigned,
      'defaultBoxBreathingPacePreset': 'standard',
      'toolPacePresets': paces,
    };

Future<void> _select(WidgetTester tester, String label) async {
  await tester.tap(find.byKey(const Key('breathing_exercise_dropdown')));
  await tester.pumpAndSettle();
  await tester.tap(find.text(label).last);
  await tester.pumpAndSettle();
}

/// Owner round 2 (4 Nov 2026): the exercise chooser is a drop-down instead of a
/// wall of chips, each technique carries a written explanation behind an (i),
/// and the three paces are gone in favour of one normal pace.
void main() {
  testWidgets('offers every technique in one drop-down, box breathing first', (tester) async {
    final recorder = _RecordingDio(_today());
    await tester.pumpWidget(_buildApp(recorder.build()));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('breathing_exercise_dropdown')), findsOneWidget);
    // The selected value is what the chooser shows while closed.
    expect(find.text('Box breathing (default)'), findsOneWidget);
    expect(find.text('Box Breathing'), findsOneWidget);
    expect(find.text('4-4-4-4'), findsOneWidget);

    await tester.tap(find.byKey(const Key('breathing_exercise_dropdown')));
    await tester.pumpAndSettle();

    expect(find.text('Humming breath'), findsOneWidget);
    expect(find.text('Physiological sigh'), findsOneWidget);
    expect(find.text('Extended exhale'), findsOneWidget);
    // Guided breathing is gone: it and Extended exhale were the same exercise
    // (Dr Goswami, 3 Nov 2026).
    expect(find.text('Guided breathing'), findsNothing);
  });

  testWidgets('there is no Slower / Standard / Faster picker left', (tester) async {
    final recorder = _RecordingDio(_today());
    await tester.pumpWidget(_buildApp(recorder.build()));
    await tester.pumpAndSettle();

    expect(find.text('Slower'), findsNothing);
    expect(find.text('Standard'), findsNothing);
    expect(find.text('Faster'), findsNothing);
    expect(find.byType(SegmentedButton<dynamic>), findsNothing);
    // And nothing is written to the server just by opening the screen.
    expect(recorder.requests.where((r) => r.method == 'PATCH'), isEmpty);
  });

  testWidgets('switching the drop-down plays that technique at its normal pace', (tester) async {
    final recorder = _RecordingDio(_today());
    await tester.pumpWidget(_buildApp(recorder.build()));
    await tester.pumpAndSettle();

    await _select(tester, 'Extended exhale');

    expect(find.text('Extended Exhale'), findsOneWidget);
    // Normal extended exhale is her 4 in, 8 out — no hold.
    expect(find.text('4-8'), findsOneWidget);
    // A saved non-standard pace from an older build no longer changes it.
    expect(find.text('3-4-8'), findsNothing);
  });

  testWidgets('a saved pace for the exercise is ignored — one normal pace for everyone',
      (tester) async {
    final recorder = _RecordingDio(_today(paces: {'box_breathing': 'faster'}));
    await tester.pumpWidget(_buildApp(recorder.build()));
    await tester.pumpAndSettle();

    expect(find.text('4-4-4-4'), findsOneWidget);
    expect(find.text('3-3-3-3'), findsNothing);
  });

  testWidgets('the (i) opens the written explanation for the chosen technique', (tester) async {
    final recorder = _RecordingDio(_today());
    await tester.pumpWidget(_buildApp(recorder.build()));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('breathing_explain_button')));
    await tester.pumpAndSettle();

    expect(find.text('Box Breathing'), findsWidgets);
    expect(find.text('What it is'), findsOneWidget);
    expect(find.textContaining('Four equal parts'), findsOneWidget);
    expect(find.text('How to do it'), findsOneWidget);

    // The sheet scrolls: the last section and the closing button are below the
    // fold on a phone, and on the 800x600 test surface too.
    await tester.drag(find.byType(ListView).last, const Offset(0, -400));
    await tester.pumpAndSettle();
    expect(find.text('Why it helps'), findsOneWidget);

    await tester.drag(find.byType(ListView).last, const Offset(0, -1200));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('breathing_explanation_close')));
    await tester.pumpAndSettle();
    expect(find.text('What it is'), findsNothing);
  });

  testWidgets('the explanation follows the selected technique', (tester) async {
    final recorder = _RecordingDio(_today());
    await tester.pumpWidget(_buildApp(recorder.build()));
    await tester.pumpAndSettle();

    await _select(tester, 'Physiological sigh');
    await tester.tap(find.byKey(const Key('breathing_explain_button')));
    await tester.pumpAndSettle();

    expect(find.text('Physiological Sigh'), findsWidgets);
    expect(find.textContaining('small extra sip'), findsOneWidget);
    expect(find.textContaining('Four equal parts'), findsNothing);
  });

  testWidgets('a technique switched in starts from its own beginning', (tester) async {
    final recorder = _RecordingDio(_today());
    await tester.pumpWidget(_buildApp(recorder.build()));
    await tester.pumpAndSettle();

    await _select(tester, 'Physiological sigh');

    final card = tester.widget<ToolCardWidget>(find.byType(ToolCardWidget));
    // A new key means a new State: the previous exercise's count, pause screen
    // or ending cannot survive the switch.
    expect(card.key, const ValueKey('physiological_sigh'));
    expect(find.text('Start'), findsOneWidget);
  });

  testWidgets('marks an assigned technique and keeps an assigned non-breathing tool',
      (tester) async {
    final recorder = _RecordingDio(_today(assigned: [
      {
        'toolId': 'physiological_sigh',
        'label': 'Physiological Sigh',
        'text': 'Two quick breaths in, one long breath out.',
        'pacePreset': 'standard',
      },
      {
        'toolId': 'grounding_5431',
        'label': '5-4-3-2-1 Grounding',
        'text': 'Notice five things you can see...',
        'pacePreset': 'standard',
      },
    ]));
    await tester.pumpWidget(_buildApp(recorder.build()));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('breathing_exercise_dropdown')));
    await tester.pumpAndSettle();
    expect(find.text('Physiological sigh · from your therapist'), findsOneWidget);
    // Not listed twice under a second name.
    expect(find.text('Physiological Sigh'), findsNothing);

    await tester.tap(find.text('5-4-3-2-1 Grounding · from your therapist').last);
    await tester.pumpAndSettle();

    // A grounding exercise has no breathing card and no pace, but it does have
    // its therapist's line behind the same (i).
    expect(find.byType(GuidedBreathingCard), findsNothing);
    await tester.tap(find.byKey(const Key('breathing_explain_button')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Notice five things'), findsOneWidget);
  });
}
