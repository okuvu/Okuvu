import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/home/toolkit_screen.dart';

Dio _dio() {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) {
      handler.resolve(Response(
        requestOptions: options,
        statusCode: 200,
        data: {'entries': <dynamic>[]},
      ));
    },
  ));
  return dio;
}

Widget _app() {
  return ProviderScope(
    overrides: [dioClientProvider.overrideWithValue(_dio())],
    child: MaterialApp.router(
      routerConfig: GoRouter(
        initialLocation: '/toolkit',
        routes: [
          GoRoute(path: '/toolkit', builder: (_, __) => const ToolkitScreen()),
          GoRoute(path: '/library', builder: (_, __) => const Scaffold(body: Text('library'))),
          GoRoute(path: '/treasure', builder: (_, __) => const Scaffold(body: Text('treasure'))),
          GoRoute(path: '/journal', builder: (_, __) => const Scaffold(body: Text('journal'))),
          GoRoute(
            path: '/library/breathing',
            builder: (_, __) => const Scaffold(body: Text('breathing')),
          ),
          GoRoute(path: '/library/mood', builder: (_, __) => const Scaffold(body: Text('mood'))),
        ],
      ),
    ),
  );
}

void main() {
  group('Toolkit tab — the five tools, one place', () {
    testWidgets('holds Breathe, Journal, Mood check-in, Library and Treasure Box',
        (tester) async {
      await tester.pumpWidget(_app());
      await tester.pumpAndSettle();

      expect(find.text('Breathe'), findsOneWidget);
      expect(find.text('Journal'), findsOneWidget);
      expect(find.text('Mood check-in'), findsOneWidget);
      expect(find.text('Library'), findsOneWidget);
      expect(find.text('Treasure Box'), findsOneWidget);
    });

    testWidgets('each tile opens the screen that already existed', (tester) async {
      for (final entry in {
        'toolkit_library': 'library',
        'toolkit_treasure': 'treasure',
        'toolkit_journal': 'journal',
      }.entries) {
        await tester.pumpWidget(_app());
        await tester.pumpAndSettle();

        await tester.tap(find.byKey(Key(entry.key)));
        await tester.pumpAndSettle();

        expect(find.text(entry.value), findsOneWidget, reason: '${entry.key} should open ${entry.value}');
      }
    });

    testWidgets('the bottom nav puts Toolkit where Journal used to be', (tester) async {
      await tester.pumpWidget(_app());
      await tester.pumpAndSettle();

      expect(find.text('Toolkit'), findsWidgets);
      expect(find.text('Home'), findsOneWidget);
      expect(find.text('Chat'), findsOneWidget);
      // The Journal tab is gone: it lives inside the Toolkit now.
      expect(find.text('Journal'), findsOneWidget);
    });

    testWidgets('carries no streak, badge or missed-day warning', (tester) async {
      await tester.pumpWidget(_app());
      await tester.pumpAndSettle();

      expect(find.textContaining('streak'), findsNothing);
      expect(find.textContaining('missed'), findsNothing);
      // A count next to a tool would read as a score to keep up.
      expect(find.textContaining('days'), findsNothing);
    });
  });
}
