import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';

import 'package:okuvu/src/features/onboarding_welcome/age_blocked_screen.dart';

void main() {
  testWidgets('renders the block message and support resources, no continue action',
      (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: AgeBlockedScreen()),
    );
    await tester.pumpAndSettle();

    expect(
      find.text("OKUVU isn't available for under-18s yet"),
      findsOneWidget,
    );
    expect(find.text('iCall (IIT Bombay)'), findsOneWidget);
    expect(find.text('Vandrevala Foundation'), findsOneWidget);
    expect(find.text('Emergency Services'), findsOneWidget);
    expect(find.text('Continue'), findsNothing);
  });

  testWidgets('back navigation is blocked (PopScope canPop: false)',
      (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: AgeBlockedScreen()),
    );
    await tester.pumpAndSettle();

    final popScope = tester.widget<PopScope>(find.byType(PopScope));
    expect(popScope.canPop, isFalse);
  });
}
