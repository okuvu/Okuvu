import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/home/providers/becoming_provider.dart';
import 'package:okuvu/src/features/home/widgets/becoming_spiral.dart';
import 'package:okuvu/src/features/home/widgets/mood_check_in.dart';
import 'package:okuvu/src/theme/app_colors.dart';

/// A Dio that answers every write with 200, so the check-in path completes.
Dio _okDio() {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) => handler.resolve(
        Response(
          requestOptions: options,
          statusCode: 200,
          data: {'success': true},
        ),
      ),
    ),
  );
  return dio;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('the journey', () {
    test('starts as a bare outline', () {
      const journey = BecomingJourney();
      expect(journey.fill, 0);
      expect(journey.turn, 0);
      expect(journey.isBareOutline, isTrue);
    });

    test('the moment that completes a turn shows it full, in full purple', () {
      const done = BecomingJourney(moments: kMomentsPerTurn);
      expect(done.fill, 1.0, reason: 'a turn must be seen complete');
      expect(done.turn, 0);
      expect(done.isBareOutline, isFalse);
    });

    test('the next moment restarts the fill from the inner end, new shade', () {
      const after = BecomingJourney(moments: kMomentsPerTurn + 1);
      expect(after.fill, closeTo(0.1, 1e-9));
      expect(after.turn, 1, reason: 'the shade has moved on');
      expect(after.shadeIndex, 1);
    });

    test('fill counts within the turn, shade counts across turns', () {
      const mid = BecomingJourney(moments: kMomentsPerTurn + 3);
      expect(mid.fill, closeTo(0.3, 1e-9));
      expect(mid.turn, 1);
      expect(mid.shadeIndex, 1);
    });

    test('the shade cycles through the whole purple family and repeats', () {
      final seen = <int>{};
      for (var turn = 0; turn < kBecomingShadeCount * 2; turn++) {
        // +1 puts the moment inside that turn, the way a real journey reads.
        final journey = BecomingJourney(moments: turn * kMomentsPerTurn + 1);
        expect(journey.turn, turn);
        seen.add(journey.shadeIndex);
      }
      expect(seen, hasLength(kBecomingShadeCount));
      expect(
        const BecomingJourney(moments: kBecomingShadeCount * kMomentsPerTurn + 1)
            .shadeIndex,
        0,
        reason: 'after the last purple it starts over',
      );
    });

    test('the shade list and its count cannot drift apart', () {
      expect(kBecomingShades, hasLength(kBecomingShadeCount));
    });
  });

  group('the geometry', () {
    test('the fill starts at the centre and ends at the honey tip', () {
      expect(spiralHeadRadius(0), 13.0);
      expect(spiralHeadRadius(1), 106.0);
    });

    test('the head only ever moves outward', () {
      var previous = -1.0;
      for (var i = 0; i <= 40; i++) {
        final radius = spiralHeadRadius(i / 40);
        expect(radius, greaterThan(previous));
        previous = radius;
      }
    });

    test('colour deepens from the light start to the turn\'s purple', () {
      final start = becomingSpiralView(const BecomingJourney());
      expect(start.fill, 0);
      expect(start.shade, kBecomingShades[0].first);

      final almost = becomingSpiralView(
        const BecomingJourney(moments: kMomentsPerTurn - 1),
      );
      // One filament short of complete is already nearly the full purple.
      expect(almost.shade, isNot(kBecomingShades[0].first));
      expect(almost.fill, closeTo(0.9, 1e-9));

      final complete = becomingSpiralView(
        const BecomingJourney(moments: kMomentsPerTurn),
      );
      expect(complete.fill, 1.0);
      expect(complete.shade, kBecomingShades[0].last);
    });

    test('a new turn fills in a different purple than the one before', () {
      final first = becomingSpiralView(const BecomingJourney(moments: 1));
      final second = becomingSpiralView(
        const BecomingJourney(moments: kMomentsPerTurn + 1),
      );
      expect(second.shade, isNot(first.shade));
    });

    testWidgets('renders a bare outline without a fill and repaints on growth',
        (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Center(
              child: BecomingSpiral(
                journey: BecomingJourney(),
                animate: false,
              ),
            ),
          ),
        ),
      );
      expect(find.byType(CustomPaint), findsWidgets);

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Center(
              child: BecomingSpiral(
                journey: BecomingJourney(moments: 4),
                animate: false,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  });

  group('what counts as a moment', () {
    test('the count survives a relaunch', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();

      final first = ProviderContainer(
        overrides: [
          becomingJourneyProvider.overrideWith(
            () => BecomingJourneyNotifier(prefs),
          ),
        ],
      );
      addTearDown(first.dispose);
      first.read(becomingJourneyProvider.notifier).recordMoment();
      await Future<void>.delayed(const Duration(milliseconds: 20));

      // A second container over the same storage is the next app launch.
      final second = ProviderContainer(
        overrides: [
          becomingJourneyProvider.overrideWith(
            () => BecomingJourneyNotifier(prefs),
          ),
        ],
      );
      addTearDown(second.dispose);
      expect(second.read(becomingJourneyProvider).moments, 1);
    });

    testWidgets('a saved mood check-in moves the spiral', (tester) async {
      final container = ProviderContainer(
        overrides: [dioClientProvider.overrideWithValue(_okDio())],
      );
      addTearDown(container.dispose);

      expect(container.read(becomingJourneyProvider).moments, 0);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(home: Scaffold(body: MoodCheckIn())),
        ),
      );
      await tester.tap(find.byKey(const Key('mood_face_4')));
      await tester.pumpAndSettle();

      expect(container.read(becomingJourneyProvider).moments, 1);
    });
  });

  test('the shapes used by the painter are the brand palette', () {
    for (final shade in kBecomingShades) {
      expect(shade, hasLength(2));
      expect(shade.first, isNot(shade.last));
    }
    expect(kBecomingShades.first.last, AppColors.royalPurple);
  });
}
