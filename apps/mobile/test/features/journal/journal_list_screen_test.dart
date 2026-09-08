import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/journal/journal_list_screen.dart';

Dio _createMockDio({required List<dynamic> entries}) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        handler.resolve(
          Response(
            requestOptions: options,
            statusCode: 200,
            data: {'entries': entries},
          ),
        );
      },
    ),
  );
  return dio;
}

Widget _buildJournalListApp({required Dio dio}) {
  return ProviderScope(
    overrides: [
      dioClientProvider.overrideWithValue(dio),
    ],
    child: MaterialApp.router(
      routerConfig: GoRouter(
        initialLocation: '/journal/history',
        routes: [
          GoRoute(
            path: '/journal/history',
            builder: (_, __) => const JournalListScreen(),
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
  group('JournalListScreen empty state', () {
    testWidgets('shows empty state message when no entries', (tester) async {
      final dio = _createMockDio(entries: []);
      await tester.pumpWidget(_buildJournalListApp(dio: dio));
      await tester.pumpAndSettle();

      expect(
        find.text('No entries yet. Your thoughts have a place here.'),
        findsOneWidget,
      );
    });

    testWidgets('renders back arrow and Journal title', (tester) async {
      final dio = _createMockDio(entries: []);
      await tester.pumpWidget(_buildJournalListApp(dio: dio));
      await tester.pumpAndSettle();

      expect(find.text('Journal'), findsOneWidget);
      expect(find.byIcon(Icons.arrow_back), findsOneWidget);
    });
  });

  group('JournalListScreen with entries', () {
    testWidgets('renders entries with emotion chip and content',
        (tester) async {
      final dio = _createMockDio(entries: [
        {
          'id': 'entry-1',
          'emotion': 'anxious',
          'intensity': 3,
          'content': 'Feeling a bit overwhelmed today.',
          'created_at': '2026-07-25T22:30:00.000Z',
        },
        {
          'id': 'entry-2',
          'emotion': 'calm',
          'intensity': 1,
          'content': 'Meditation helped.',
          'created_at': '2026-07-24T18:00:00.000Z',
        },
      ]);
      await tester.pumpWidget(_buildJournalListApp(dio: dio));
      await tester.pumpAndSettle();

      expect(find.text('Anxious'), findsOneWidget);
      expect(find.text('Calm'), findsOneWidget);
      expect(find.text('Feeling a bit overwhelmed today.'), findsOneWidget);
      expect(find.text('Meditation helped.'), findsOneWidget);
    });

    testWidgets('tapping an entry expands full content', (tester) async {
      final dio = _createMockDio(entries: [
        {
          'id': 'entry-1',
          'emotion': 'sad',
          'intensity': 4,
          'content':
              'This is a longer content that should be truncated to two lines in the preview but shown in full when expanded.',
          'created_at': '2026-07-25T22:30:00.000Z',
        },
      ]);
      await tester.pumpWidget(_buildJournalListApp(dio: dio));
      await tester.pumpAndSettle();

      // Tap the entry to expand it
      await tester.tap(find.text('Sad'));
      await tester.pumpAndSettle();

      // Full content should be visible (not truncated)
      expect(
        find.text(
          'This is a longer content that should be truncated to two lines in the preview but shown in full when expanded.',
        ),
        findsOneWidget,
      );
    });
  });

  group('JournalListScreen error state', () {
    testWidgets('shows error and retry on network failure', (tester) async {
      final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            handler.reject(
              DioException(
                requestOptions: options,
                type: DioExceptionType.connectionError,
              ),
            );
          },
        ),
      );

      await tester.pumpWidget(_buildJournalListApp(dio: dio));
      await tester.pumpAndSettle();

      expect(find.text('Failed to load entries.'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });
  });
}
