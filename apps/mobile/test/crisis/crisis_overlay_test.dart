import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/crisis/crisis_overlay.dart';

Widget _crisisApp() {
  return const ProviderScope(
    child: MaterialApp(
      home: Scaffold(
        body: CrisisOverlay(),
      ),
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
        expect(find.byIcon(LucideIcons.shield), findsOneWidget);

        // E17-S7 — the clinical lead's corrected list, in her order:
        // Tele-MANAS first (iCall is not 24x7), iCall last with its hours.
        expect(find.text('Tele-MANAS'), findsOneWidget);
        expect(find.text('Vandrevala Foundation'), findsOneWidget);
        expect(find.text('Sneha, Chennai'), findsOneWidget);
        expect(find.text('iCall (TISS)'), findsOneWidget);
        expect(find.text('Emergency Services'), findsOneWidget);

        // The retired name and number are gone from this screen entirely.
        expect(find.text('NIMHANS'), findsNothing);
        expect(find.textContaining('IIT Bombay'), findsNothing);
        expect(find.textContaining('1860'), findsNothing);

        // Phone numbers
        expect(find.text('14416'), findsOneWidget);
        expect(find.text('+91 9999666555'), findsOneWidget);
        expect(find.text('044-24640050'), findsOneWidget);
        expect(find.text('9152987821'), findsOneWidget);
        expect(find.text('112'), findsOneWidget);

        // iCall's hours are stated on the card, per her §4 correction.
        expect(find.textContaining('8 am\u20139 pm'), findsOneWidget);

        // Order, measured by position on screen. Her correction is about
        // order as much as numbers: the same cards in a different sequence
        // still fail it.
        double dy(String text) => tester.getTopLeft(find.text(text)).dy;
        expect(dy('Tele-MANAS'), lessThan(dy('Vandrevala Foundation')));
        expect(dy('Vandrevala Foundation'), lessThan(dy('Sneha, Chennai')));
        expect(dy('Sneha, Chennai'), lessThan(dy('iCall (TISS)')));
        expect(dy('iCall (TISS)'), lessThan(dy('Emergency Services')));

        // Call buttons (+1 InkWell from the "I'm safe for now" TextButton)
        expect(find.byType(InkWell), findsNWidgets(6));
      },
    );

    testWidgets(
      'tapping "I\'m safe for now" calls crisisOverlayProvider.hide()',
      (WidgetTester tester) async {
        tester.view.physicalSize = const Size(1080, 2400);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        final container = ProviderContainer();
        addTearDown(container.dispose);
        container.read(crisisOverlayProvider.notifier).show();

        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: const MaterialApp(
              home: Scaffold(body: CrisisOverlay()),
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(container.read(crisisOverlayProvider), true);

        await tester.tap(find.byKey(const Key('crisisOverlayDismissButton')));
        await tester.pumpAndSettle();

        expect(container.read(crisisOverlayProvider), false);
      },
    );
  });
}