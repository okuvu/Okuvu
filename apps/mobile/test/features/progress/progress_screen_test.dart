import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/config/app_config.dart';
import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/progress/progress_screen.dart';

Dio _createMockDio() {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) {
      if (options.path == '/progress/mood') {
        handler.resolve(Response(
          requestOptions: options,
          statusCode: 200,
          data: {
            'entries': [
              {
                'date': DateTime.now().subtract(const Duration(days: 1)).toIso8601String(),
                'mood_value': 3,
              },
              {
                'date': DateTime.now().subtract(const Duration(days: 3)).toIso8601String(),
                'mood_value': 4,
              },
              {
                'date': DateTime.now().subtract(const Duration(days: 5)).toIso8601String(),
                'mood_value': 2,
              },
            ],
          },
        ));
        return;
      }
      if (options.path == '/users/me/context') {
        handler.resolve(Response(
          requestOptions: options,
          statusCode: 200,
          data: {
            'care_plan': {
              'care_plan_id': 'CP1',
              'assignment_state': 'confirmed',
            },
            'engagement': {
              'current_streak': 3,
              'longest_streak': 5,
              'voice_mode_enabled': false,
            },
          },
        ));
        return;
      }
      handler.resolve(Response(
        requestOptions: options,
        statusCode: 200,
        data: {'success': true},
      ));
    },
  ));
  return dio;
}

Widget _buildTestApp({required Dio dio}) {
  return ProviderScope(
    overrides: [
      dioClientProvider.overrideWithValue(dio),
    ],
    child: const MaterialApp(
      home: ProgressScreen(),
    ),
  );
}

void main() {
  AppConfig.init('dev');

  group('ProgressScreen - empty state', () {
    testWidgets('renders exact empty-state text', (tester) async {
      final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
      dio.interceptors.add(InterceptorsWrapper(
        onRequest: (options, handler) {
          handler.resolve(Response(
            requestOptions: options,
            statusCode: 200,
            data: {'entries': []},
          ));
        },
      ));

      await tester.pumpWidget(_buildTestApp(dio: dio));
      await tester.pumpAndSettle();

      expect(
        find.text('Start checking in to see your progress here.'),
        findsOneWidget,
      );
    });

    testWidgets('renders care phase placeholder in empty state',
        (tester) async {
      final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
      dio.interceptors.add(InterceptorsWrapper(
        onRequest: (options, handler) {
          handler.resolve(Response(
            requestOptions: options,
            statusCode: 200,
            data: {'entries': []},
          ));
        },
      ));

      await tester.pumpWidget(_buildTestApp(dio: dio));
      await tester.pumpAndSettle();

      expect(find.text('Your care journey'), findsOneWidget);
      expect(
        find.text('Start your journey to see your care phase.'),
        findsOneWidget,
      );
    });
  });

  group('ProgressScreen - filled state', () {
    testWidgets('renders mood chart', (tester) async {
      await tester.pumpWidget(_buildTestApp(dio: _createMockDio()));
      await tester.pumpAndSettle();

      expect(find.text('Mood over the last 14 days'), findsOneWidget);
      expect(find.text('Each dot is a mood you logged.'), findsOneWidget);
    });

    testWidgets('renders care phase card in filled state', (tester) async {
      await tester.pumpWidget(_buildTestApp(dio: _createMockDio()));
      await tester.pumpAndSettle();

      expect(find.text('Your care journey'), findsOneWidget);
      expect(
        find.text(
          'Current stage information will be available here once your care plan progresses.',
        ),
        findsOneWidget,
      );
    });

  });

  group('ProgressScreen - error state', () {
    testWidgets('renders error state when mood fetch fails', (tester) async {
      final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
      dio.interceptors.add(InterceptorsWrapper(
        onRequest: (options, handler) {
          handler.reject(DioException(
            requestOptions: options,
            type: DioExceptionType.connectionTimeout,
          ));
        },
      ));

      await tester.pumpWidget(_buildTestApp(dio: dio));
      await tester.pumpAndSettle();

      expect(find.text('Could not load your mood trend'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });

    testWidgets('retry button invalidates provider', (tester) async {
      final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
      dio.interceptors.add(InterceptorsWrapper(
        onRequest: (options, handler) {
          handler.reject(DioException(
            requestOptions: options,
            type: DioExceptionType.connectionTimeout,
          ));
        },
      ));

      await tester.pumpWidget(_buildTestApp(dio: dio));
      await tester.pumpAndSettle();

      expect(find.text('Retry'), findsOneWidget);
      // Tapping retry should not throw
      await tester.tap(find.text('Retry'));
    });
  });


}
