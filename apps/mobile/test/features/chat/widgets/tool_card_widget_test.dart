import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/features/chat/models/tool_card_config.dart';
import 'package:okuvu/src/features/chat/widgets/tool_card_widget.dart';
import 'package:okuvu/src/features/chat/widgets/grounding_card.dart';

// Regression test: ToolCardWidget used to have its own local, non-functional
// GroundingCard class (static instructions only, no text input, no way to
// submit) that silently shadowed the real, interactive GroundingCard from
// grounding_card.dart — same class name, same file that already imported
// it. The shadowing wasn't a compile error (a same-library declaration
// always wins over an imported one with the same name in Dart), so
// ToolCardType.grounding5431 rendered a dead card with no way to actually
// complete the 5-4-3-2-1 exercise from chat. Only flutter analyze's
// "unused_import" warning on grounding_card.dart hinted at it.
void main() {
  testWidgets('grounding5431 renders the real, interactive GroundingCard (not a static duplicate)', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          home: Scaffold(
            body: ToolCardWidget(
              config: ToolCardConfig(type: ToolCardType.grounding5431),
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    // The real widget is a ConsumerStatefulWidget with a text input and a
    // Skip button; the old dead duplicate had neither.
    expect(find.byType(GroundingCard), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
    expect(find.text('Skip'), findsOneWidget);
  });
}
