import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:evia/src/config/app_config.dart';
import 'package:evia/src/core/providers.dart';
import 'package:evia/src/core/tts_service.dart';
import 'package:evia/src/core/websocket_service.dart';
import 'package:evia/src/features/chat/chat_screen.dart';
import 'package:evia/src/features/chat/models/chat_state.dart';

class FakeWebSocketService extends WebSocketService {
  @override
  void connect({required String wsBaseUrl, required String token}) {}

  @override
  void sendUserTurn(String content) {}

  @override
  void injectMockAgentTurn(String content) {}

  @override
  void retry() {}

  @override
  void disconnect() {}
}

class FakeTtsService extends TtsService {
  @override
  Future<bool> isLanguageAvailable() async => true;

  @override
  Future<void> setVoiceEnabled(bool value) async {}

  @override
  Future<void> speak(String text) async {}

  @override
  Future<void> stop() async {}
}

Dio _createMockDio() {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));

  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        if (options.path == '/settings/voice' &&
            options.method.toUpperCase() == 'GET') {
          handler.resolve(
            Response(
              requestOptions: options,
              statusCode: 200,
              data: {
                'voice_enabled': false,
              },
            ),
          );
          return;
        }

        handler.resolve(
          Response(
            requestOptions: options,
            statusCode: 200,
            data: {
              'success': true,
            },
          ),
        );
      },
    ),
  );

  return dio;
}

Widget _buildChatScreenApp({required WebSocketService webSocketService}) {
  return ProviderScope(
    overrides: [
      webSocketServiceProvider.overrideWithValue(webSocketService),
      ttsServiceProvider.overrideWithValue(FakeTtsService()),
      dioClientProvider.overrideWithValue(_createMockDio()),
    ],
    child: MaterialApp.router(
      routerConfig: GoRouter(
        initialLocation: '/chat',
        routes: [
          GoRoute(
            path: '/chat',
            builder: (_, __) => const ChatScreen(),
          ),
        ],
      ),
    ),
  );
}

void main() {
  AppConfig.init('dev');

  group('ChatScreen', () {
    testWidgets('shows the turn count and session closed UI without real connections', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(1080, 1920);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final fakeWs = FakeWebSocketService();

      await tester.pumpWidget(_buildChatScreenApp(webSocketService: fakeWs));
      await tester.pumpAndSettle();

      final container = ProviderScope.containerOf(
        tester.element(find.byType(ChatScreen)),
      );

      container.read(chatMessagesProvider.notifier).state = const ChatState(
        messages: [],
        turnCount: 3,
        isSessionClosed: true,
      );
            await tester.pump(const Duration(milliseconds: 500));

      expect(find.text('3/10 turns'), findsOneWidget);
      expect(find.text('Session ended'), findsOneWidget);

      final textField = tester.widget<TextField>(find.byType(TextField));
      expect(textField.enabled, isFalse);
      expect(textField.decoration?.hintText, 'Session ended');

      final sendButton = tester.widget<IconButton>(find.byType(IconButton));
      expect(sendButton.onPressed, isNull);
      await tester.pumpAndSettle();
    });
  });
}

