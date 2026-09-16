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
  testWidgets('defaults to box breathing with the saved pace preset, no assigned-exercise row',
      (tester) async {
    final recorder = _RecordingDio({
      'reminders': [],
      'assignedExercises': [],
      'defaultBoxBreathingPacePreset': 'faster',
    });
    await tester.pumpWidget(_buildApp(recorder.build()));
    await tester.pumpAndSettle();

    expect(find.text('Box Breathing'), findsOneWidget);
    expect(find.text('From your therapist'), findsNothing);
    // Faster preset: 3-3-3-3
    expect(find.text('3-3-3-3'), findsOneWidget);
    final segmentedButton = tester
        .widget<SegmentedButton<BreathingPace>>(find.byType(SegmentedButton<BreathingPace>));
    expect(segmentedButton.selected, {BreathingPace.faster});
  });

  testWidgets('shows an assigned-exercise chip row and switches the active exercise on tap',
      (tester) async {
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

    expect(find.text('From your therapist'), findsOneWidget);
    expect(find.text('Physiological Sigh'), findsWidgets);

    await tester.tap(find.text('Physiological Sigh').first);
    await tester.pumpAndSettle();

    // Standard physiological sigh: 2+2-8, 5 cycles
    expect(find.text('2+2-8'), findsOneWidget);
  });

  testWidgets('hides the pace picker for a non-tunable assigned exercise (grounding)',
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

  testWidgets('changing the pace preset sends a PATCH /users/me/tool-preference', (tester) async {
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
