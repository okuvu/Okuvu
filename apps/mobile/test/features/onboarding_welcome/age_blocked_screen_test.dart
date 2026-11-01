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

    // E17-S7 rev 6 §4.12 — her text, in full.
    expect(find.text('OKUVU is for adults aged 18 and over.'), findsOneWidget);
    expect(
      find.text('If you need to talk to someone today, these people can help:'),
      findsOneWidget,
    );
    expect(find.text('Tele-MANAS'), findsOneWidget);
    expect(find.text('14416'), findsOneWidget);
    expect(find.text('free, 24 hours, for all ages'), findsOneWidget);
    expect(find.text('Child Helpline'), findsOneWidget);
    expect(find.text('1098'), findsOneWidget);
    expect(find.text('If you are in danger right now, call 112.'), findsOneWidget);
    expect(
      find.text(
          'It can also help to talk to a parent, teacher or another adult you trust.'),
      findsOneWidget,
    );
    // The heading no longer reads as a roadmap item, and this screen does not
    // carry the five-line block (rev 6 §8.1 item 1 applied item 12).
    expect(find.textContaining('yet'), findsNothing);
    expect(find.textContaining('1860'), findsNothing);
    expect(find.text('Vandrevala Foundation'), findsNothing);
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
