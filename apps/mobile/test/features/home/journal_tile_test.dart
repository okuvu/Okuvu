import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:evia/src/features/home/widgets/journal_tile.dart';

Widget _buildJournalTileApp() {
  return ProviderScope(
    child: MaterialApp.router(
      routerConfig: GoRouter(
        initialLocation: '/home',
        routes: [
          GoRoute(
            path: '/home',
            builder: (_, __) => const Scaffold(
              body: JournalTile(),
            ),
          ),
          GoRoute(
            path: '/journal',
            builder: (_, __) => const Scaffold(
              body: Center(child: Text('Journal Screen')),
            ),
          ),
        ],
      ),
    ),
  );
}

void main() {
  group('JournalTile', () {
    testWidgets('renders Journal text and icon', (tester) async {
      await tester.pumpWidget(_buildJournalTileApp());
      await tester.pumpAndSettle();

      expect(find.text('Journal'), findsOneWidget);
      expect(find.byIcon(Icons.book_outlined), findsOneWidget);
      expect(find.byIcon(Icons.chevron_right), findsOneWidget);
    });

    testWidgets('tapping navigates to /journal', (tester) async {
      await tester.pumpWidget(_buildJournalTileApp());
      await tester.pumpAndSettle();

      await tester.tap(find.text('Journal'));
      await tester.pumpAndSettle();

      expect(find.text('Journal Screen'), findsOneWidget);
    });
  });
}
