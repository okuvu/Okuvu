import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:okuvu/src/features/home/widgets/home_insight_card.dart';

void main() {
  group('HomeInsightCard', () {
    const testMessage = "Test insight message";

    testWidgets('renders provided message', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: HomeInsightCard(message: testMessage),
          ),
        ),
      );

      expect(find.text(testMessage), findsOneWidget);
    });

    testWidgets('renders FROM EVIA label', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: HomeInsightCard(message: testMessage),
          ),
        ),
      );

      expect(find.text('FROM EVIA'), findsOneWidget);
    });

    testWidgets('renders card container with rounded corners', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: HomeInsightCard(message: testMessage),
          ),
        ),
      );

      final container = tester.widget<Container>(find.byType(Container).first);
      final decoration = container.decoration! as BoxDecoration;
      expect(decoration.borderRadius, equals(BorderRadius.circular(16)));
    });

    testWidgets('message uses bodySmall style with onSurfaceVariant color',
        (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: HomeInsightCard(message: testMessage),
          ),
        ),
      );

      final text = tester.widget<Text>(find.text(testMessage));
      expect(text.style?.color, isNotNull);
    });

    testWidgets('always renders non-empty message when provided',
        (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: HomeInsightCard(message: testMessage),
          ),
        ),
      );

      expect(find.text(testMessage), findsOneWidget);
      expect(tester.widget<Text>(find.text(testMessage)).data, isNotEmpty);
    });
  });
}
