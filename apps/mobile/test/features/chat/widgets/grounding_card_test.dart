import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:evia/src/core/providers.dart';
import 'package:evia/src/core/websocket_service.dart';
import 'package:evia/src/features/chat/models/grounding_result.dart';
import 'package:evia/src/features/chat/widgets/grounding_card.dart';

class _SpyWebSocketService extends WebSocketService {
  GroundingResult? sentResult;
  int sendToolResultCallCount = 0;

  @override
  void sendToolResult(GroundingResult result) {
    sendToolResultCallCount++;
    sentResult = result;
  }
}

Widget _buildTestApp() {
  return ProviderScope(
    overrides: [
      webSocketServiceProvider.overrideWithValue(_SpyWebSocketService()),
    ],
    child: const MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: GroundingCard(),
        ),
      ),
    ),
  );
}

void main() {
  group('GroundingCard', () {
    testWidgets('renders header and first prompt on initial render',
        (tester) async {
      await tester.pumpWidget(_buildTestApp());
      await tester.pumpAndSettle();

      expect(find.text('5-4-3-2-1 Grounding'), findsOneWidget);
      expect(find.text('Skip'), findsOneWidget);
      expect(find.text('things you can see'), findsOneWidget);
    });

    testWidgets('entering an item creates a teal pill', (tester) async {
      await tester.pumpWidget(_buildTestApp());
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'a tree');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();

      expect(find.text('a tree'), findsOneWidget);
    });

    testWidgets('input clears after adding an item', (tester) async {
      await tester.pumpWidget(_buildTestApp());
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'a tree');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();

      final textField = tester.widget<TextField>(find.byType(TextField));
      expect(textField.controller?.text, isEmpty);
    });

    testWidgets('auto-advances to next sense after required count',
        (tester) async {
      await tester.pumpWidget(_buildTestApp());
      await tester.pumpAndSettle();

      for (var i = 0; i < 5; i++) {
        await tester.enterText(find.byType(TextField), 'item $i');
        await tester.testTextInput.receiveAction(TextInputAction.done);
        await tester.pumpAndSettle();
      }

      expect(find.text('things you can touch'), findsOneWidget);
    });

    testWidgets('progress dots update as senses complete', (tester) async {
      await tester.pumpWidget(_buildTestApp());
      await tester.pumpAndSettle();

      for (var i = 0; i < 5; i++) {
        await tester.enterText(find.byType(TextField), 'item $i');
        await tester.testTextInput.receiveAction(TextInputAction.done);
        await tester.pumpAndSettle();
      }

      expect(find.text('things you can touch'), findsOneWidget);
    });

    testWidgets('skip collapses card and does not call sendToolResult',
        (tester) async {
      await tester.pumpWidget(_buildTestApp());
      await tester.pumpAndSettle();

      await tester.tap(find.text('Skip'));
      await tester.pumpAndSettle();

      expect(find.text('Grounding exercise skipped'), findsOneWidget);
      expect(find.text('Skip'), findsNothing);

      final ws = ProviderScope.containerOf(
        tester.element(find.byType(GroundingCard)),
      ).read(webSocketServiceProvider) as _SpyWebSocketService;
      expect(ws.sendToolResultCallCount, 0);
    });

    testWidgets('completion sends typed GroundingResult', (tester) async {
      await tester.pumpWidget(_buildTestApp());
      await tester.pumpAndSettle();

      final itemsBySense = [
        ['see 1', 'see 2', 'see 3', 'see 4', 'see 5'],
        ['touch 1', 'touch 2', 'touch 3', 'touch 4'],
        ['hear 1', 'hear 2', 'hear 3'],
        ['smell 1', 'smell 2'],
        ['taste 1'],
      ];

      for (final items in itemsBySense) {
        for (final item in items) {
          await tester.enterText(find.byType(TextField), item);
          await tester.testTextInput.receiveAction(TextInputAction.done);
          await tester.pumpAndSettle();
        }
      }

      expect(find.text('Grounding exercise complete'), findsOneWidget);

      final ws = ProviderScope.containerOf(
        tester.element(find.byType(GroundingCard)),
      ).read(webSocketServiceProvider) as _SpyWebSocketService;
      expect(ws.sendToolResultCallCount, 1);
      expect(ws.sentResult, isNotNull);
      expect(ws.sentResult!.see, ['see 1', 'see 2', 'see 3', 'see 4', 'see 5']);
      expect(ws.sentResult!.touch, ['touch 1', 'touch 2', 'touch 3', 'touch 4']);
      expect(ws.sentResult!.hear, ['hear 1', 'hear 2', 'hear 3']);
      expect(ws.sentResult!.smell, ['smell 1', 'smell 2']);
      expect(ws.sentResult!.taste, ['taste 1']);
    });

    testWidgets('empty submit is ignored', (tester) async {
      await tester.pumpWidget(_buildTestApp());
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), '');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();

      expect(find.text('things you can see'), findsOneWidget);
    });
  });
}
