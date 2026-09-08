import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/features/crisis/crisis_overlay.dart';

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
        tester.view.physicalSize = const Size(1080, 2400);
        tester.view.devicePixelRatio = 1.0;

        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        await tester.pumpWidget(_crisisApp());
        await tester.pumpAndSettle();

        // Title
        expect(find.text("You're not alone."), findsOneWidget);

        // Description
        expect(
          find.text('Here are some people you can call right now.'),
          findsOneWidget,
        );

        // Header icon
        expect(find.byIcon(Icons.shield), findsOneWidget);

        // Crisis resources
        expect(find.text('iCall (IIT Bombay)'), findsOneWidget);
        expect(find.text('Vandrevala Foundation'), findsOneWidget);
        expect(find.text('NIMHANS'), findsOneWidget);
        expect(find.text('Snehi'), findsOneWidget);
        expect(find.text('Emergency Services'), findsOneWidget);

        // Phone numbers
        expect(find.text('9152987821'), findsOneWidget);
        expect(find.text('1860-2662-345'), findsOneWidget);
        expect(find.text('080-46110007'), findsOneWidget);
        expect(find.text('044-24640050'), findsOneWidget);
        expect(find.text('112'), findsOneWidget);

        // Call buttons
        expect(find.byType(InkWell), findsNWidgets(5));
      },
    );
  });
}