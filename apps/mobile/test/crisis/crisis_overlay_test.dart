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
        expect(find.text('Emergency services'), findsOneWidget);
        expect(find.text('SNEHA, Chennai'), findsOneWidget);
        expect(find.text('iCall (TISS)'), findsOneWidget);

        // The retired name and number are gone from this screen entirely.
        expect(find.text('NIMHANS'), findsNothing);
        expect(find.textContaining('IIT Bombay'), findsNothing);
        expect(find.textContaining('1860'), findsNothing);

        // Phone numbers
        expect(find.text('14416'), findsOneWidget);
        expect(find.text('+91 9999 666 555'), findsOneWidget);
        expect(find.text('044-24640050'), findsOneWidget);
        expect(find.text('9152987821'), findsOneWidget);
        expect(find.text('112'), findsOneWidget);

        // Her parentheticals, verbatim (rev 6 §4.11: descriptions = her
        // parentheticals). iCall's hours are the ones TISS publishes.
        expect(find.text('free, 24 hours'), findsOneWidget);
        expect(find.text('24 hours, call or WhatsApp'), findsOneWidget);
        expect(find.text('10am-10pm, every day'), findsOneWidget);
        expect(find.text('Monday to Saturday, 10am-8pm'), findsOneWidget);
        expect(find.textContaining('8 am'), findsNothing);

        // Footer and exit button, §4.11.
        expect(
          find.text("You can come back to OKUVU whenever you're ready."),
          findsOneWidget,
        );
        expect(find.text('Close'), findsOneWidget);
        expect(find.text("I'm safe for now"), findsNothing);

        // Order, measured by position on screen. Her correction is about
        // order as much as numbers: the same cards in a different sequence
        // still fail it.
        double dy(String text) => tester.getTopLeft(find.text(text)).dy;
        expect(dy('Tele-MANAS'), lessThan(dy('Vandrevala Foundation')));
        expect(dy('Vandrevala Foundation'), lessThan(dy('Emergency services')));
        expect(dy('Emergency services'), lessThan(dy('SNEHA, Chennai')));
        expect(dy('SNEHA, Chennai'), lessThan(dy('iCall (TISS)')));

        // Call buttons (+1 InkWell from the "Close" TextButton)
        expect(find.byType(InkWell), findsNWidgets(6));
      },
    );

    testWidgets(
      'tapping "Close" calls crisisOverlayProvider.hide()',
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