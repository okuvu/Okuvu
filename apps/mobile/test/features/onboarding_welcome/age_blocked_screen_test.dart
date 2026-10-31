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
    // E17-S7 — same corrected list, order and names as the crisis overlay.
    expect(find.text('Tele-MANAS'), findsOneWidget);
    expect(find.text('Vandrevala Foundation'), findsOneWidget);
    expect(find.text('Sneha, Chennai'), findsOneWidget);
    expect(find.text('iCall (TISS)'), findsOneWidget);
    expect(find.text('Emergency Services'), findsOneWidget);
    expect(find.textContaining('1860'), findsNothing);
    expect(find.text('14416'), findsOneWidget);
    expect(find.text('+91 9999666555'), findsOneWidget);
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
