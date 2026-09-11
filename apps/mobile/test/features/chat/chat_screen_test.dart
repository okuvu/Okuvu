import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:okuvu/src/config/app_config.dart';
import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/core/tts_service.dart';
import 'package:okuvu/src/core/websocket_service.dart';
import 'package:okuvu/src/features/chat/chat_screen.dart';
import 'package:okuvu/src/features/chat/models/chat_state.dart';

class FakeWebSocketService extends WebSocketService {
  FakeWebSocketService({WsConnectionState initialState = WsConnectionState.disconnected})
      : _stateCtrl = StreamController<WsConnectionState>.broadcast(),
        _state = initialState;

  final StreamController<WsConnectionState> _stateCtrl;

  WsConnectionState _state;

  @override
  WsConnectionState get currentState => _state;

  @override
  Stream<WsConnectionState> get stateStream => _stateCtrl.stream;

  void setConnectionState(WsConnectionState state) {
    _state = state;
    _stateCtrl.add(state);
  }

  @override
  Future<void> connect({
    required String wsBaseUrl,
    required String token,
  }) async {}

  @override
  void sendUserTurn(String content) {}

  @override
  void injectMockAgentTurn(String content) {}

  @override
  void retry() {}

  @override
  void disconnect() {}

  @override
  void dispose() {
    _stateCtrl.close();
  }
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
        turnCount: 10,
        isSessionClosed: true,
      );
      await tester.pump(const Duration(milliseconds: 500));

      expect(find.text('This session has ended.'), findsOneWidget);

      expect(find.byType(TextField), findsNothing);
      expect(find.text('Back to Home'), findsOneWidget);

      await tester.pumpAndSettle();
    });

    testWidgets('input is disabled when WebSocket is not sessionActive', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(1080, 1920);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final fakeWs = FakeWebSocketService(initialState: WsConnectionState.disconnected);

      await tester.pumpWidget(_buildChatScreenApp(webSocketService: fakeWs));
      await tester.pumpAndSettle();

      final inputField = tester.widget<TextField>(find.byKey(const ValueKey('chat_input')));
      expect(inputField.enabled, isFalse);

      final sendButton = tester.widget<IconButton>(find.byKey(const ValueKey('chat_send')));
      expect(sendButton.onPressed, isNull);
    });

    testWidgets('input is enabled when WebSocket is sessionActive', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(1080, 1920);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final fakeWs = FakeWebSocketService(initialState: WsConnectionState.sessionActive);

      await tester.pumpWidget(_buildChatScreenApp(webSocketService: fakeWs));
      await tester.pumpAndSettle();

      final inputField = tester.widget<TextField>(find.byKey(const ValueKey('chat_input')));
      expect(inputField.enabled, isTrue);

      final sendButton = tester.widget<IconButton>(find.byKey(const ValueKey('chat_send')));
      expect(sendButton.onPressed, isNotNull);
    });

    testWidgets('send has no effect when input is disabled due to disconnection', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(1080, 1920);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final fakeWs = FakeWebSocketService(initialState: WsConnectionState.disconnected);

      await tester.pumpWidget(_buildChatScreenApp(webSocketService: fakeWs));
      await tester.pumpAndSettle();

      await tester.enterText(find.byKey(const ValueKey('chat_input')), 'Hello');

      final sendButton = tester.widget<IconButton>(find.byKey(const ValueKey('chat_send')));
      expect(sendButton.onPressed, isNull);

      final container = ProviderScope.containerOf(
        tester.element(find.byType(ChatScreen)),
      );
      expect(container.read(chatMessagesProvider).messages, isEmpty);
    });

    testWidgets('input becomes enabled when WebSocket transitions to sessionActive', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(1080, 1920);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final fakeWs = FakeWebSocketService(initialState: WsConnectionState.disconnected);

      await tester.pumpWidget(_buildChatScreenApp(webSocketService: fakeWs));
      await tester.pumpAndSettle();

      expect(
        tester.widget<TextField>(find.byKey(const ValueKey('chat_input'))).enabled,
        isFalse,
      );

      fakeWs.setConnectionState(WsConnectionState.sessionActive);
      await tester.pumpAndSettle();

      expect(
        tester.widget<TextField>(find.byKey(const ValueKey('chat_input'))).enabled,
        isTrue,
      );
    });
  });
}
