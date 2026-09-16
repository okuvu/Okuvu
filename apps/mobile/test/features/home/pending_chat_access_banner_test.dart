import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/home/widgets/pending_chat_access_banner.dart';

Dio _mockDio({Map<String, dynamic>? pendingChatAccessRequest}) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        if (options.path.endsWith('/users/me/today')) {
          handler.resolve(Response(
            requestOptions: options,
            statusCode: 200,
            data: {
              'reminders': [],
              'pendingChatAccessRequest': pendingChatAccessRequest,
            },
          ));
          return;
        }
        handler.resolve(Response(requestOptions: options, statusCode: 200, data: {'success': true}));
      },
    ),
  );
  return dio;
}

Widget _buildApp(Dio dio, {bool crisisActive = false}) {
  return ProviderScope(
    overrides: [
      dioClientProvider.overrideWithValue(dio),
      if (crisisActive) crisisOverlayProvider.overrideWith(_AlwaysActiveCrisis.new),
    ],
    child: const MaterialApp(home: Scaffold(body: PendingChatAccessBanner())),
  );
}

class _AlwaysActiveCrisis extends CrisisOverlayNotifier {
  @override
  bool build() => true;
}

void main() {
  testWidgets('renders nothing when there is no pending request', (tester) async {
    await tester.pumpWidget(_buildApp(_mockDio(pendingChatAccessRequest: null)));
    await tester.pumpAndSettle();

    expect(find.byType(Container), findsNothing);
  });

  testWidgets('shows the exact decisions-doc copy and Grant/Not now buttons', (tester) async {
    await tester.pumpWidget(_buildApp(_mockDio(pendingChatAccessRequest: {
      'therapistId': 'th_1',
      'therapistName': 'Dr. Rao',
    })));
    await tester.pumpAndSettle();

    expect(find.text('Dr. Rao asked to see summaries of your chats.'), findsOneWidget);
    expect(
      find.text(
        'It means the themes you two talk about — not your messages. Your chats work exactly the same either way; this only changes what they can read. You can switch it off any time.',
      ),
      findsOneWidget,
    );
    expect(find.text('Grant'), findsOneWidget);
    expect(find.text('Not now'), findsOneWidget);
  });

  testWidgets('"Not now" dismisses locally without calling the API', (tester) async {
    final dio = _mockDio(pendingChatAccessRequest: {
      'therapistId': 'th_1',
      'therapistName': 'Dr. Rao',
    });
    var chatAccessCalled = false;
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.path.endsWith('/users/me/chat-access')) chatAccessCalled = true;
          handler.next(options);
        },
      ),
    );

    await tester.pumpWidget(_buildApp(dio));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Not now'));
    await tester.pumpAndSettle();

    expect(find.text('Grant'), findsNothing);
    expect(chatAccessCalled, isFalse);
  });

  testWidgets('is suppressed while the crisis overlay is active', (tester) async {
    await tester.pumpWidget(_buildApp(
      _mockDio(pendingChatAccessRequest: {'therapistId': 'th_1', 'therapistName': 'Dr. Rao'}),
      crisisActive: true,
    ));
    await tester.pumpAndSettle();

    expect(find.text('Grant'), findsNothing);
  });
}
