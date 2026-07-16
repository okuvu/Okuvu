import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:evia/src/features/crisis/crisis_overlay.dart';

Widget _crisisApp() {
  return const MaterialApp(
    home: Scaffold(
      body: CrisisOverlay(),
    ),
  );
}

void main() {
  group('CrisisOverlay', () {
    testWidgets(
      'renders crisis support resources without network dependencies',
      (WidgetTester tester) async {
        await tester.pumpWidget(_crisisApp());
        await tester.pumpAndSettle();

        // Title
        expect(find.text('Crisis Support'), findsOneWidget);

        // Description
        expect(
          find.text(
            "If you're in immediate danger, please call emergency services.",
          ),
          findsOneWidget,
        );

        // Emergency icon
        expect(find.byIcon(Icons.emergency), findsOneWidget);

        // Crisis resources
        expect(find.text('iCall (IIT Bombay)'), findsOneWidget);
        expect(find.text('Vandrevala Foundation'), findsOneWidget);
        expect(find.text('NIMHANS'), findsOneWidget);
        expect(find.text('Snehi'), findsOneWidget);
        expect(find.text('Emergency Services'), findsOneWidget);

        // Phone numbers
        expect(find.text('9152987821'), findsOneWidget);
        expect(find.text('18602662345'), findsOneWidget);
        expect(find.text('08046110007'), findsOneWidget);
        expect(find.text('04424640050'), findsOneWidget);
        expect(find.text('112'), findsOneWidget);

        // One-tap call affordances
        expect(find.byType(InkWell), findsNWidgets(5));
      },
    );
  });
}