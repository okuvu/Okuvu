import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/config/app_config.dart';
import 'package:okuvu/src/features/intake/intake_screen.dart';
import 'package:okuvu/src/features/intake/widgets/onboarding_progress_bar.dart';

void main() {
  AppConfig.init('dev');

  Widget createIntakeTestApp() {
    return const ProviderScope(
      child: MaterialApp(
        home: IntakeScreen(),
      ),
    );
  }

  group('IntakeScreen - full intake form rendering', () {
    testWidgets('renders initial assistant message and input bar',
        (tester) async {
      await tester.pumpWidget(createIntakeTestApp());
      await tester.pumpAndSettle();

      expect(find.text("What's been weighing on your mind lately?"),
          findsOneWidget);
      expect(find.byType(TextField), findsOneWidget);
      expect(find.byIcon(Icons.send_rounded), findsOneWidget);
    });

    testWidgets('shows OnboardingProgressBar with first segment filled',
        (tester) async {
      await tester.pumpWidget(createIntakeTestApp());
      await tester.pumpAndSettle();

      final progressBar = tester.widget<OnboardingProgressBar>(
        find.byType(OnboardingProgressBar),
      );
      expect(progressBar.filledSegments, 2);
    });
  });

  group('IntakeScreen - required field indicators', () {
    testWidgets('send button disabled when input is empty', (tester) async {
      await tester.pumpWidget(createIntakeTestApp());
      await tester.pumpAndSettle();

      final sendButton = tester.widget<IconButton>(
        find.widgetWithIcon(IconButton, Icons.send_rounded),
      );
      expect(sendButton.onPressed, isNull);
    });

    testWidgets('send button enabled after entering text', (tester) async {
      await tester.pumpWidget(createIntakeTestApp());
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'I feel anxious');
      await tester.pump();

      final sendButton = tester.widget<IconButton>(
        find.widgetWithIcon(IconButton, Icons.send_rounded),
      );
      expect(sendButton.onPressed, isNotNull);
    });

    testWidgets('send button disabled after entering and clearing text',
        (tester) async {
      await tester.pumpWidget(createIntakeTestApp());
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'I feel anxious');
      await tester.pump();

      await tester.enterText(find.byType(TextField), '');
      await tester.pump();

      final sendButton = tester.widget<IconButton>(
        find.widgetWithIcon(IconButton, Icons.send_rounded),
      );
      expect(sendButton.onPressed, isNull);
    });
  });

  group('IntakeScreen - step progression', () {
    testWidgets(
        'advances to step 2 (care plan selection) after sending message',
        (tester) async {
      await tester.pumpWidget(createIntakeTestApp());
      await tester.pumpAndSettle();

      await tester.enterText(
          find.byType(TextField), 'I feel anxious about work');
      await tester.pump();
      await tester.tap(find.byIcon(Icons.send_rounded));
      await tester.pumpAndSettle();

      expect(find.text('Anxiety support'), findsOneWidget);
      expect(find.text('Low mood support'), findsOneWidget);
      expect(find.text('Stress and burnout support'), findsOneWidget);
      expect(find.byType(OutlinedButton), findsNWidgets(3));
    });

    testWidgets('advances to step 3 (completion) after selecting care plan',
        (tester) async {
      await tester.pumpWidget(createIntakeTestApp());
      await tester.pumpAndSettle();

      await tester.enterText(
          find.byType(TextField), 'I feel anxious about work');
      await tester.pump();
      await tester.tap(find.byIcon(Icons.send_rounded));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Anxiety support'));
      await tester.pumpAndSettle();

      expect(
        find.text(
            "Thanks. I'll tailor your experience around Anxiety support."),
        findsOneWidget,
      );
    });

    testWidgets('back button on step 2 returns to step 1', (tester) async {
      await tester.pumpWidget(createIntakeTestApp());
      await tester.pumpAndSettle();

      await tester.enterText(
          find.byType(TextField), 'I feel anxious about work');
      await tester.pump();
      await tester.tap(find.byIcon(Icons.send_rounded));
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.arrow_back), findsOneWidget);

      await tester.tap(find.byIcon(Icons.arrow_back));
      await tester.pumpAndSettle();

      expect(find.text("What's been weighing on your mind lately?"),
          findsOneWidget);
      expect(find.byType(TextField), findsOneWidget);
    });

    testWidgets('back button on step 3 returns to step 2', (tester) async {
      await tester.pumpWidget(createIntakeTestApp());
      await tester.pumpAndSettle();

      await tester.enterText(
          find.byType(TextField), 'I feel anxious about work');
      await tester.pump();
      await tester.tap(find.byIcon(Icons.send_rounded));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Anxiety support'));
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.arrow_back), findsOneWidget);

      await tester.tap(find.byIcon(Icons.arrow_back));
      await tester.pumpAndSettle();

      expect(find.text('Anxiety support'), findsOneWidget);
      expect(find.text('Low mood support'), findsOneWidget);
      expect(find.text('Stress and burnout support'), findsOneWidget);
    });

    testWidgets('progress bar updates with each step', (tester) async {
      await tester.pumpWidget(createIntakeTestApp());
      await tester.pumpAndSettle();

      var progressBar = tester.widget<OnboardingProgressBar>(
        find.byType(OnboardingProgressBar),
      );
      expect(progressBar.filledSegments, 2);

      await tester.enterText(
          find.byType(TextField), 'I feel anxious about work');
      await tester.pump();
      await tester.tap(find.byIcon(Icons.send_rounded));
      await tester.pumpAndSettle();

      progressBar = tester.widget<OnboardingProgressBar>(
        find.byType(OnboardingProgressBar),
      );
      expect(progressBar.filledSegments, 3);

      await tester.tap(find.text('Anxiety support'));
      await tester.pumpAndSettle();

      progressBar = tester.widget<OnboardingProgressBar>(
        find.byType(OnboardingProgressBar),
      );
      expect(progressBar.filledSegments, 4);
    });
  });
}
