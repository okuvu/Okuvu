import 'dart:async';

import 'package:dio/dio.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import 'package:okuvu/src/config/app_config.dart';
import 'package:okuvu/src/core/auth_service.dart';
import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/core/tts_service.dart';
import 'package:okuvu/src/core/websocket_service.dart';
import 'package:okuvu/src/features/chat/chat_screen.dart';
import 'package:okuvu/src/features/chat/models/chat_state.dart';

/// Firebase-free fake — ChatScreen's initState reaches authServiceProvider
/// via FlavorConfig.devBypassToken's fallback, hitting the same
/// Firebase.initializeApp()-unavailable-in-tests landmine documented
/// elsewhere this session. Mirrors otp_login_screen_test.dart's fake.
class FakeAuthService implements AuthService {
  @override
  User? get currentUser => null;

  @override
  Future<String?> getIdToken() async => null;

  @override
  Future<void> verifyPhone({
    required String phoneNumber,
    required void Function(String verificationId, int? forceResendingToken) onCodeSent,
    required void Function(FirebaseAuthException) onError,
    int? forceResendingToken,
  }) async {}

  @override
  Future<void> verifyOtp({
    required String verificationId,
    required String smsCode,
  }) async {}

  @override
  Future<void> signOut() async {}
}

class FakeWebSocketService extends WebSocketService {
  FakeWebSocketService({WsConnectionState initialState = WsConnectionState.disconnected})
      : _stateCtrl = StreamController<WsConnectionState>.broadcast(),
        _sessionClosedCtrl = StreamController<String?>.broadcast(),
        _state = initialState;

  final StreamController<WsConnectionState> _stateCtrl;
  final StreamController<String?> _sessionClosedCtrl;

  WsConnectionState _state;

  @override
  WsConnectionState get currentState => _state;

  @override
  Stream<WsConnectionState> get stateStream => _stateCtrl.stream;

  @override
  Stream<String?> get sessionClosedStream => _sessionClosedCtrl.stream;

  void setConnectionState(WsConnectionState state) {
    _state = state;
    _stateCtrl.add(state);
  }

  void simulateSessionClosed([String? reason]) {
    _sessionClosedCtrl.add(reason);
  }

  int disconnectCallCount = 0;

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
  void disconnect() {
    disconnectCallCount++;
  }

  @override
  void dispose() {
    _stateCtrl.close();
    _sessionClosedCtrl.close();
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

Dio _createMockDioWithCareEnded(String therapistName) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));

  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        if (options.path.endsWith('/users/me/today')) {
          handler.resolve(
            Response(
              requestOptions: options,
              statusCode: 200,
              data: {
                'careEnded': true,
                'careEndedByTherapistName': therapistName,
              },
            ),
          );
          return;
        }
        if (options.path == '/settings/voice' &&
            options.method.toUpperCase() == 'GET') {
          handler.resolve(
            Response(
              requestOptions: options,
              statusCode: 200,
              data: {'voice_enabled': false},
            ),
          );
          return;
        }
        handler.resolve(
          Response(requestOptions: options, statusCode: 200, data: {'success': true}),
        );
      },
    ),
  );

  return dio;
}

Widget _buildChatScreenApp({required WebSocketService webSocketService, Dio? dio}) {
  return ProviderScope(
    overrides: [
      webSocketServiceProvider.overrideWithValue(webSocketService),
      ttsServiceProvider.overrideWithValue(FakeTtsService()),
      dioClientProvider.overrideWithValue(dio ?? _createMockDio()),
      authServiceProvider.overrideWithValue(FakeAuthService()),
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

      // The send button also gates on non-empty text (no silent no-op on an
      // empty message) — enter text first to check its enabled state.
      await tester.enterText(find.byKey(const ValueKey('chat_input')), 'Hello');
      await tester.pump();

      final sendButton = tester.widget<IconButton>(find.byKey(const ValueKey('chat_send')));
      expect(sendButton.onPressed, isNotNull);
    });

    testWidgets('send button is disabled while the message field is empty', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(1080, 1920);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final fakeWs = FakeWebSocketService(initialState: WsConnectionState.sessionActive);

      await tester.pumpWidget(_buildChatScreenApp(webSocketService: fakeWs));
      await tester.pumpAndSettle();

      final sendButton = tester.widget<IconButton>(find.byKey(const ValueKey('chat_send')));
      expect(sendButton.onPressed, isNull);

      await tester.enterText(find.byKey(const ValueKey('chat_input')), '   ');
      await tester.pump();

      final sendButtonWhitespace = tester.widget<IconButton>(find.byKey(const ValueKey('chat_send')));
      expect(sendButtonWhitespace.onPressed, isNull);
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

    testWidgets('becomes read-only with an explanatory message once care has ended', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(1080, 1920);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final fakeWs = FakeWebSocketService(initialState: WsConnectionState.sessionActive);

      await tester.pumpWidget(_buildChatScreenApp(
        webSocketService: fakeWs,
        dio: _createMockDioWithCareEnded('Dr. Rao'),
      ));
      await tester.pumpAndSettle();

      expect(find.text('This chat is read-only now that care has ended.'), findsOneWidget);
      expect(find.byType(TextField), findsNothing);
      expect(find.text('Back to Home'), findsOneWidget);
    });

    testWidgets('ending the session while a response is still pending does not disconnect immediately', (
      tester,
    ) async {
      // Safety-critical regression test: _confirmEndSession used to call
      // disconnect() synchronously the moment the user confirmed "End
      // session," even if the last message's response — potentially a
      // CRISIS_SIGNAL — hadn't arrived yet. disconnect() sends SESSION_CLOSE
      // and tears down the socket in the same call, so any in-flight
      // response would never reach the app, with no fallback path. The
      // fix holds the actual disconnect open for the same window the app
      // already waits for a turn response before giving up on it.
      tester.view.physicalSize = const Size(1080, 1920);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final fakeWs = FakeWebSocketService(initialState: WsConnectionState.sessionActive);

      await tester.pumpWidget(_buildChatScreenApp(webSocketService: fakeWs));
      await tester.pumpAndSettle();

      await tester.enterText(find.byKey(const ValueKey('chat_input')), 'Hello');
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('chat_send')));
      await tester.pump();

      // Tap back, then confirm "End session" — a response to the message
      // just sent has not arrived yet.
      await tester.tap(find.byIcon(LucideIcons.arrowLeft));
      await tester.pump();
      await tester.pump();
      await tester.tap(find.text('End session'));
      await tester.pump();

      expect(fakeWs.disconnectCallCount, 0);

      // The bounded wait elapses with still no response — disconnect now
      // proceeds as the safety-net fallback.
      await tester.pump(const Duration(seconds: 20));
      expect(fakeWs.disconnectCallCount, 1);
    });

    testWidgets('ending the session with no response pending disconnects immediately', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(1080, 1920);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final fakeWs = FakeWebSocketService(initialState: WsConnectionState.sessionActive);

      await tester.pumpWidget(_buildChatScreenApp(webSocketService: fakeWs));
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(LucideIcons.arrowLeft));
      await tester.pumpAndSettle();
      await tester.tap(find.text('End session'));
      await tester.pump();

      expect(fakeWs.disconnectCallCount, 1);
    });

    testWidgets('chat becomes usable again once a new session opens after a prior one closed', (
      tester,
    ) async {
      // Regression test: chatMessagesProvider is a plain, never-disposed
      // NotifierProvider, and isSessionClosed was previously only ever set
      // to true (on sessionClosedStream) — nothing reset it back to false,
      // so once any session closed, every later visit to /chat showed the
      // locked "This session has ended" screen for the rest of the app's
      // lifetime, even after a brand-new session opened successfully.
      tester.view.physicalSize = const Size(1080, 1920);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final fakeWs = FakeWebSocketService(initialState: WsConnectionState.sessionActive);

      await tester.pumpWidget(_buildChatScreenApp(webSocketService: fakeWs));
      await tester.pumpAndSettle();

      expect(find.byType(TextField), findsOneWidget);

      fakeWs.simulateSessionClosed('USER_REQUESTED');
      await tester.pump(const Duration(milliseconds: 500));

      expect(find.text('This session has ended.'), findsOneWidget);
      expect(find.byType(TextField), findsNothing);

      // A brand-new session opens successfully (sessionActive again).
      fakeWs.setConnectionState(WsConnectionState.connecting);
      fakeWs.setConnectionState(WsConnectionState.sessionActive);
      await tester.pump();

      expect(find.text('This session has ended.'), findsNothing);
      expect(find.byType(TextField), findsOneWidget);
    });
  });
}
