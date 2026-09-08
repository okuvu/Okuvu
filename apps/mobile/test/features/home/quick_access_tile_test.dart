import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/features/home/widgets/quick_access_tile.dart';

void main() {
  group('QuickAccessTile', () {
    testWidgets('renders icon, label and subtitle', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: QuickAccessTile(
              icon: '\u{1F32B}',
              label: 'Breathe',
              subtitle: '4 min',
              onTap: _noop,
            ),
          ),
        ),
      );

      expect(find.text('\u{1F32B}'), findsOneWidget);
      expect(find.text('Breathe'), findsOneWidget);
      expect(find.text('4 min'), findsOneWidget);
    });

    testWidgets('fires onTap when tapped', (tester) async {
      bool tapped = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: QuickAccessTile(
              icon: '\u{1F4D4}',
              label: 'Journal',
              subtitle: '3 entries',
              onTap: () => tapped = true,
            ),
          ),
        ),
      );

      await tester.tap(find.text('Journal'));
      expect(tapped, isTrue);
    });

    testWidgets('hides subtitle when null', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: QuickAccessTile(
              icon: '\u{1F32B}',
              label: 'Breathe',
              onTap: _noop,
            ),
          ),
        ),
      );

      expect(find.text('Breathe'), findsOneWidget);
      expect(find.text('4 min'), findsNothing);
    });

    testWidgets('has white background and DDE2E8 border', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: QuickAccessTile(
              icon: '\u{1F4D4}',
              label: 'Journal',
              subtitle: '0 entries',
              onTap: _noop,
            ),
          ),
        ),
      );

      final container = tester.widget<Container>(find.byType(Container).first);
      final decoration = container.decoration! as BoxDecoration;

      expect(decoration.color, equals(Colors.white));
      expect(
        (decoration.border as Border).top.color,
        equals(const Color(0xFFDDE2E8)),
      );
    });
  });
}

void _noop() {}
