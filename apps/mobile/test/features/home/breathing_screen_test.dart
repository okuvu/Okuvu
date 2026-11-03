import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/home/breathing_screen.dart';
import 'package:okuvu/src/features/chat/models/breathing_presets.dart';

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

void main() {
  testWidgets('offers every breathing exercise on first visit, box breathing selected by default',
      (tester) async {
    final recorder = _RecordingDio({
      'reminders': [],
      'assignedExercises': [],
      'defaultBoxBreathingPacePreset': 'faster',
    });
    await tester.pumpWidget(_buildApp(recorder.build()));
    await tester.pumpAndSettle();

    // Owner round 2 (3 Nov 2026): the rest of the therapist portal's
    // exercises are on the screen, not only the box-breathing default.
    expect(find.text('Box breathing (default)'), findsOneWidget);
    expect(find.text('Guided breathing'), findsOneWidget);
    expect(find.text('Physiological sigh'), findsOneWidget);
    expect(find.text('Extended exhale'), findsOneWidget);

    expect(find.text('Box Breathing'), findsOneWidget);
    // Faster preset: 3-3-3-3
    expect(find.text('3-3-3-3'), findsOneWidget);
    final segmentedButton = tester
        .widget<SegmentedButton<BreathingPace>>(find.byType(SegmentedButton<BreathingPace>));
    expect(segmentedButton.selected, {BreathingPace.faster});
  });

  testWidgets('switching to another exercise plays that exercise', (tester) async {
    final recorder = _RecordingDio({
      'reminders': [],
      'assignedExercises': [],
      'defaultBoxBreathingPacePreset': 'standard',
    });
    await tester.pumpWidget(_buildApp(recorder.build()));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Extended exhale'));
    await tester.pumpAndSettle();

    expect(find.text('Extended Exhale'), findsOneWidget);
    // Standard extended exhale: 4-2-8
    expect(find.text('4-2-8'), findsOneWidget);
  });

  testWidgets('reads each exercise back at its own saved pace', (tester) async {
    final recorder = _RecordingDio({
      'reminders': [],
      'assignedExercises': [],
      'defaultBoxBreathingPacePreset': 'faster',
      'toolPacePresets': {'box_breathing': 'faster', 'extended_exhale': 'slower'},
    });
    await tester.pumpWidget(_buildApp(recorder.build()));
    await tester.pumpAndSettle();

    expect(find.text('3-3-3-3'), findsOneWidget);

    await tester.tap(find.text('Extended exhale'));
    await tester.pumpAndSettle();

    // Slower extended exhale: 3-4-8
    expect(find.text('3-4-8'), findsOneWidget);
    final segmentedButton = tester
        .widget<SegmentedButton<BreathingPace>>(find.byType(SegmentedButton<BreathingPace>));
    expect(segmentedButton.selected, {BreathingPace.slower});

    // And back to box breathing without inheriting the sigh's pace.
    await tester.tap(find.text('Box breathing (default)'));
    await tester.pumpAndSettle();
    expect(find.text('3-3-3-3'), findsOneWidget);
  });

  testWidgets('changing the pace of a non-default exercise saves it against that exercise',
      (tester) async {
    final recorder = _RecordingDio({
      'reminders': [],
      'assignedExercises': [],
      'defaultBoxBreathingPacePreset': 'standard',
    });
    await tester.pumpWidget(_buildApp(recorder.build()));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Physiological sigh'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Faster'));
    await tester.pumpAndSettle();

    final patch = recorder.requests.firstWhere(
      (r) => r.method == 'PATCH' && r.path == '/users/me/tool-preference',
    );
    expect(patch.data, {'tool_id': 'physiological_sigh', 'pace_preset': 'faster'});
    // Faster physiological sigh: 2+2-5
    expect(find.text('2+2-5'), findsOneWidget);
  });

  testWidgets('marks an exercise the therapist assigned', (tester) async {
    final recorder = _RecordingDio({
      'reminders': [],
      'assignedExercises': [
        {
          'toolId': 'physiological_sigh',
          'label': 'Physiological Sigh',
          'text': 'Two quick breaths in, one long breath out.',
          'pacePreset': 'standard',
        },
      ],
      'defaultBoxBreathingPacePreset': 'standard',
    });
    await tester.pumpWidget(_buildApp(recorder.build()));
    await tester.pumpAndSettle();

    expect(find.text('Physiological sigh · from your therapist'), findsOneWidget);
    // Not listed twice: the built-in chip carries the marking instead of a
    // second chip with the portal's own label.
    expect(find.text('Physiological Sigh'), findsNothing);
  });

  testWidgets('keeps an assigned tool that is not a breathing exercise, without a pace picker',
      (tester) async {
    final recorder = _RecordingDio({
      'reminders': [],
      'assignedExercises': [
        {
          'toolId': 'grounding_5431',
          'label': '5-4-3-2-1 Grounding',
          'text': 'Notice five things you can see...',
          'pacePreset': 'standard',
        },
      ],
      'defaultBoxBreathingPacePreset': 'standard',
    });
    await tester.pumpWidget(_buildApp(recorder.build()));
    await tester.pumpAndSettle();

    await tester.tap(find.text('5-4-3-2-1 Grounding').first);
    await tester.pumpAndSettle();

    expect(find.byType(SegmentedButton<BreathingPace>), findsNothing);
    expect(find.text('5-4-3-2-1 Grounding'), findsWidgets);
  });

  testWidgets('changing the default exercise pace sends a PATCH /users/me/tool-preference',
      (tester) async {
    final recorder = _RecordingDio({
      'reminders': [],
      'assignedExercises': [],
      'defaultBoxBreathingPacePreset': 'standard',
    });
    await tester.pumpWidget(_buildApp(recorder.build()));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Faster'));
    await tester.pumpAndSettle();

    final patch = recorder.requests.firstWhere(
      (r) => r.method == 'PATCH' && r.path == '/users/me/tool-preference',
    );
    expect(patch.data, {'tool_id': 'box_breathing', 'pace_preset': 'faster'});
  });
}
