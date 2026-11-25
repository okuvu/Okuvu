import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/features/chat/widgets/sos_calm_chat_button.dart';
import 'package:okuvu/src/features/library/library_api.dart';

/// Owner's rule (24 Nov 2026): SOS calm is one tap from Home **and from chat**.
/// In chat it is a single app-bar button rather than a card, and it exists only
/// when the worksheet is in the Library listing the app already has. A draft, a
/// withdrawn row, or a client who cannot see it gets no button at all.
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
      home: Scaffold(
        appBar: PreferredSize(
          preferredSize: Size.fromHeight(kToolbarHeight),
          child: SizedBox.shrink(),
        ),
        body: SosCalmChatButton(),
      ),
    ),
  );
}

void main() {
  testWidgets('no button when the worksheet is not in the client listing',
      (tester) async {
    await tester.pumpWidget(harness(const [_other]));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('chat_sos_calm')), findsNothing);
  });

  testWidgets('no button when the worksheet is in the list but not available',
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

    expect(find.byKey(const Key('chat_sos_calm')), findsNothing);
  });

  testWidgets('the button appears, labelled from the listing, when it is there',
      (tester) async {
    await tester.pumpWidget(harness(const [_sos]));
    await tester.pumpAndSettle();

    final button = find.byKey(const Key('chat_sos_calm'));
    expect(button, findsOneWidget);
    expect(
      tester.widget<IconButton>(button).tooltip,
      'SOS calm',
    );
  });
}
