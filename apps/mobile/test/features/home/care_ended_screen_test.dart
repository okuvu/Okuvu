import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:share_plus/share_plus.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/home/care_ended_screen.dart';

Dio _mockDio({List<Map<String, dynamic>> journalEntries = const []}) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        if (options.path.endsWith('/journal')) {
          handler.resolve(Response(
            requestOptions: options,
            statusCode: 200,
            data: {'entries': journalEntries},
          ));
          return;
        }
        handler.resolve(Response(requestOptions: options, statusCode: 200, data: {}));
      },
    ),
  );
  return dio;
}

Future<void> _instantShare(ShareParams params) async {}

Widget _buildApp({Dio? dio, String? therapistName}) {
  return ProviderScope(
    overrides: [
      dioClientProvider.overrideWithValue(dio ?? _mockDio()),
    ],
    child: MaterialApp(
      home: CareEndedScreen(
        therapistName: therapistName,
        shareOverride: _instantShare,
      ),
    ),
  );
}

void main() {
  testWidgets('shows the exact locked copy and "still true" list', (tester) async {
    await tester.pumpWidget(_buildApp(therapistName: 'Dr. Rao'));
    await tester.pump();

    expect(find.text('Your therapist has closed this space.'), findsOneWidget);
    expect(
      find.text(
        "This can bring up a lot, and whatever you're feeling is fair. "
        "Dr. Rao has ended your care on OKUVU — that's a decision between the two of you, not a verdict on you.",
      ),
      findsOneWidget,
    );
    expect(find.text('• The crisis line stays — always one tap away.'), findsOneWidget);
    expect(find.text('• Your journal is still yours, export any time.'), findsOneWidget);
    expect(find.text('• Reminders stop, and chat goes read-only.'), findsOneWidget);
    expect(
      find.text("If this wasn't what you expected, you can talk to Dr. Rao directly."),
      findsOneWidget,
    );
  });

  testWidgets('falls back to a generic label when no therapist name is given', (tester) async {
    await tester.pumpWidget(_buildApp());
    await tester.pump();

    expect(find.textContaining('Your therapist has ended your care on OKUVU'), findsOneWidget);
  });

  testWidgets('"Get support now" opens the crisis overlay', (tester) async {
    await tester.pumpWidget(_buildApp(therapistName: 'Dr. Rao'));
    await tester.pump();

    final element = tester.element(find.byType(CareEndedScreen));
    final container = ProviderScope.containerOf(element);
    expect(container.read(crisisOverlayProvider), isFalse);

    await tester.ensureVisible(find.text('Get support now'));
    await tester.tap(find.text('Get support now'));
    await tester.pump();

    expect(container.read(crisisOverlayProvider), isTrue);
  });

  testWidgets('"Export my writing" shows a loading state while exporting', (tester) async {
    await tester.pumpWidget(_buildApp(
      dio: _mockDio(journalEntries: [
        {
          'id': 'j1',
          'emotion': 'calm',
          'intensity': 3,
          'content': 'A quiet day.',
          'created_at': '2026-09-01T10:00:00.000Z',
        },
      ]),
      therapistName: 'Dr. Rao',
    ));
    await tester.pump();

    await tester.ensureVisible(find.text('Export my writing'));
    await tester.tap(find.text('Export my writing'));
    await tester.pump();

    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    await tester.pumpAndSettle();
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });
}
