import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/features/home/widgets/sos_calm_card.dart';
import 'package:okuvu/src/features/library/library_api.dart';

/// Owner's rule (24 Nov 2026): the SOS calm card is on Home only when the
/// worksheet is approved and visible — that is, when it is in the Library
/// listing the app already has. A draft, a withdrawn row, or a client who
/// cannot see it gets no card at all.
const _sos = LibraryCard(
  toolId: 'ws_sos_calm',
  label: 'SOS calm',
  summary: 'One tap: a long breath out, then look around the room. Nothing to type.',
  section: 'calm_my_body',
  accessMode: 'open',
  kind: 'worksheet',
  available: true,
);

const _other = LibraryCard(
  toolId: 'grounding_5431',
  label: '5-4-3-2-1 grounding',
  summary: null,
  section: 'calm_my_body',
  accessMode: 'open',
  kind: 'exercise',
  available: true,
);

Widget harness(List<LibraryCard> cards) {
  return ProviderScope(
    overrides: [
      libraryCardsProvider.overrideWith((ref) async => cards),
    ],
    child: const MaterialApp(
      home: Scaffold(body: SosCalmCard()),
    ),
  );
}

void main() {
  testWidgets('the card does not render when the worksheet is not in the list',
      (tester) async {
    await tester.pumpWidget(harness(const [_other]));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('home_sos_calm')), findsNothing);
    expect(find.text('SOS calm'), findsNothing);
  });

  testWidgets('the card does not render when the worksheet is not available',
      (tester) async {
    await tester.pumpWidget(harness(const [
      LibraryCard(
        toolId: 'ws_sos_calm',
        label: 'SOS calm',
        summary: null,
        section: 'calm_my_body',
        accessMode: 'assigned',
        kind: 'worksheet',
        available: false,
      ),
    ]));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('home_sos_calm')), findsNothing);
  });

  testWidgets('the card renders, with the listing\'s own words, when it is there',
      (tester) async {
    await tester.pumpWidget(harness(const [_sos]));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('home_sos_calm')), findsOneWidget);
    expect(find.text('SOS calm'), findsOneWidget);
    expect(
      find.text('One tap: a long breath out, then look around the room. '
          'Nothing to type.'),
      findsOneWidget,
    );
  });
}
