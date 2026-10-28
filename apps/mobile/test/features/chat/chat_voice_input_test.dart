import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:okuvu/src/config/app_config.dart';
import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/core/speech_service.dart';
import 'package:okuvu/src/core/tts_service.dart';
import 'package:okuvu/src/core/websocket_service.dart';
import 'package:okuvu/src/features/chat/chat_screen.dart';

import '../../support/fake_auth_service.dart';

class FakeWebSocketService extends WebSocketService {
  FakeWebSocketService({
    WsConnectionState initialState = WsConnectionState.sessionActive,
  })  : _stateCtrl = StreamController<WsConnectionState>.broadcast(),
        _sessionClosedCtrl = StreamController<String?>.broadcast(),
        _state = initialState;

  final StreamController<WsConnectionState> _stateCtrl;
  final StreamController<String?> _sessionClosedCtrl;

  WsConnectionState _state;

  /// Every turn the screen handed to the socket, in order.
  final List<String> sentTurns = [];

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

  @override
  Future<void> connect({
    required String wsBaseUrl,
    required String token,
  }) async {}

  @override
  void sendUserTurn(String content) => sentTurns.add(content);

  @override
  void injectMockAgentTurn(String content) {}

  @override
  void retry() {}

  @override
  void disconnect() {}

  @override
  void dispose() {
    _stateCtrl.close();
    _sessionClosedCtrl.close();
  }
}

class FakeTtsService extends TtsService {
  @override
  Future<bool> isLanguageAvailable() async => false;

  @override
  Future<void> setVoiceEnabled(bool value) async {}

  @override
  Future<void> speak(String text) async {}

  @override
  Future<void> stop() async {}
}

class FakeSpeechService extends SpeechService {
  FakeSpeechService({this.outcome = SpeechStartOutcome.listening});

  SpeechStartOutcome outcome;

  int startCalls = 0;
  int stopCalls = 0;
  int cancelCalls = 0;
  int disposeCalls = 0;

  void Function(String words, bool isFinal)? _onWords;
  void Function()? _onEnded;

  /// Simulates the recognizer producing (or refining) a transcript.
  void emit(String words, {bool isFinal = false}) => _onWords?.call(words, isFinal);

  /// Simulates the recognizer finishing on its own — silence or timeout.
  void endSession() => _onEnded?.call();

  @override
  Future<SpeechStartOutcome> start({
    required void Function(String words, bool isFinal) onWords,
    required void Function() onEnded,
  }) async {
    startCalls++;
    _onWords = onWords;
    _onEnded = onEnded;
    return outcome;
  }

  @override
  Future<void> stop() async => stopCalls++;

  @override
  Future<void> cancel() async => cancelCalls++;

  @override
  void dispose() => disposeCalls++;
}

Dio _mockDio() {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        if (options.path == '/settings/voice' &&
            options.method.toUpperCase() == 'GET') {
          handler.resolve(Response(
            requestOptions: options,
            statusCode: 200,
            data: {'voice_enabled': false},
          ));
          return;
        }
        handler.resolve(Response(
          requestOptions: options,
          statusCode: 200,
          data: {'success': true},
        ));
      },
    ),
  );
  return dio;
}

Widget _app({
  required WebSocketService webSocketService,
  required SpeechService speechService,
}) {
  return ProviderScope(
    overrides: [
      webSocketServiceProvider.overrideWithValue(webSocketService),
      ttsServiceProvider.overrideWithValue(FakeTtsService()),
      speechServiceProvider.overrideWithValue(speechService),
      dioClientProvider.overrideWithValue(_mockDio()),
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

const _screen = Size(1080, 1920);

void _sizeUp(WidgetTester tester) {
  tester.view.physicalSize = _screen;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

String _fieldText(WidgetTester tester) {
  final field =
      tester.widget<TextField>(find.byKey(const ValueKey('chat_input')));
  return field.controller!.text;
}

IconButton _mic(WidgetTester tester) =>
    tester.widget<IconButton>(find.byKey(const ValueKey('chat_mic')));

void main() {
  AppConfig.init('dev');

  group('ChatScreen voice input', () {
    testWidgets('offers a mic button beside the message field', (tester) async {
      _sizeUp(tester);
      await tester.pumpWidget(_app(
        webSocketService: FakeWebSocketService(),
        speechService: FakeSpeechService(),
      ));
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('chat_mic')), findsOneWidget);
      expect(_mic(tester).onPressed, isNotNull);
      expect(_mic(tester).tooltip, 'Talk instead of typing');
    });

    testWidgets('the mic is unavailable while the socket is not active',
        (tester) async {
      _sizeUp(tester);
      await tester.pumpWidget(_app(
        webSocketService:
            FakeWebSocketService(initialState: WsConnectionState.disconnected),
        speechService: FakeSpeechService(),
      ));
      await tester.pumpAndSettle();

      expect(_mic(tester).onPressed, isNull);
    });

    testWidgets('spoken words appear in the field and are not sent on their own',
        (tester) async {
      _sizeUp(tester);
      final ws = FakeWebSocketService();
      final speech = FakeSpeechService();
      await tester.pumpWidget(
          _app(webSocketService: ws, speechService: speech));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('chat_mic')));
      await tester.pump();

      expect(speech.startCalls, 1);

      speech.emit('I keep waking up at three in the morning', isFinal: true);
      await tester.pump();

      // Transcribed, but still the user's to send — a mis-hearing in a
      // mental-health conversation must never go out on its own.
      expect(_fieldText(tester), 'I keep waking up at three in the morning');
      expect(ws.sentTurns, isEmpty);
    });

    testWidgets('a partial transcript is refined rather than repeated',
        (tester) async {
      _sizeUp(tester);
      final speech = FakeSpeechService();
      await tester.pumpWidget(_app(
          webSocketService: FakeWebSocketService(), speechService: speech));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('chat_mic')));
      await tester.pump();

      // The recognizer reports the cumulative utterance each time.
      speech.emit('I feel');
      await tester.pump();
      expect(_fieldText(tester), 'I feel');

      speech.emit('I feel anxious today');
      await tester.pump();
      expect(_fieldText(tester), 'I feel anxious today');
    });

    testWidgets('speech is appended to text the user already typed',
        (tester) async {
      _sizeUp(tester);
      final speech = FakeSpeechService();
      await tester.pumpWidget(_app(
          webSocketService: FakeWebSocketService(), speechService: speech));
      await tester.pumpAndSettle();

      await tester.enterText(find.byKey(const ValueKey('chat_input')), 'Today');
      await tester.pump();

      await tester.tap(find.byKey(const ValueKey('chat_mic')));
      await tester.pump();
      speech.emit('my chest feels tight');
      await tester.pump();

      expect(_fieldText(tester), 'Today my chest feels tight');
    });

    testWidgets('the mic shows an active state while listening', (tester) async {
      _sizeUp(tester);
      await tester.pumpWidget(_app(
        webSocketService: FakeWebSocketService(),
        speechService: FakeSpeechService(),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('chat_mic')));
      await tester.pump();

      expect(_mic(tester).tooltip, 'Stop listening');
      expect(find.text('Listening… tap the mic to stop'), findsOneWidget);
    });

    testWidgets('tapping the mic again ends dictation', (tester) async {
      _sizeUp(tester);
      final speech = FakeSpeechService();
      await tester.pumpWidget(_app(
          webSocketService: FakeWebSocketService(), speechService: speech));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('chat_mic')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('chat_mic')));
      await tester.pump();

      expect(speech.stopCalls, 1);
      expect(_mic(tester).tooltip, 'Talk instead of typing');
    });

    testWidgets('dictation returns to idle when the recognizer finishes itself',
        (tester) async {
      _sizeUp(tester);
      final speech = FakeSpeechService();
      await tester.pumpWidget(_app(
          webSocketService: FakeWebSocketService(), speechService: speech));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('chat_mic')));
      await tester.pump();
      speech.emit('That is all I wanted to say', isFinal: true);
      speech.endSession();
      await tester.pump();

      expect(_mic(tester).tooltip, 'Talk instead of typing');
      expect(_fieldText(tester), 'That is all I wanted to say');
    });

    testWidgets('sending after dictation sends the spoken words and stops the mic',
        (tester) async {
      _sizeUp(tester);
      final ws = FakeWebSocketService();
      final speech = FakeSpeechService();
      await tester.pumpWidget(
          _app(webSocketService: ws, speechService: speech));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('chat_mic')));
      await tester.pump();
      speech.emit('I feel calmer after breathing', isFinal: true);
      await tester.pump();

      await tester.tap(find.byKey(const ValueKey('chat_send')));
      await tester.pump();

      expect(ws.sentTurns, ['I feel calmer after breathing']);
      expect(speech.cancelCalls, greaterThanOrEqualTo(1));
      expect(_fieldText(tester), isEmpty);
    });

    testWidgets('a late transcript from the stopped mic does not refill the field',
        (tester) async {
      _sizeUp(tester);
      final ws = FakeWebSocketService();
      final speech = FakeSpeechService();
      await tester.pumpWidget(
          _app(webSocketService: ws, speechService: speech));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('chat_mic')));
      await tester.pump();
      speech.emit('I feel okay', isFinal: true);
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('chat_send')));
      await tester.pump();

      // The recognizer's final result lands after the field was cleared.
      speech.emit('I feel okay', isFinal: true);
      await tester.pump();

      expect(_fieldText(tester), isEmpty);
      expect(ws.sentTurns, ['I feel okay']);
    });

    testWidgets('a denied microphone permission explains what is needed',
        (tester) async {
      _sizeUp(tester);
      final speech = FakeSpeechService(
          outcome: SpeechStartOutcome.permissionDenied);
      await tester.pumpWidget(_app(
          webSocketService: FakeWebSocketService(), speechService: speech));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('chat_mic')));
      await tester.pump();

      expect(
        find.text('Microphone access is needed to talk instead of type.'),
        findsOneWidget,
      );
      expect(_mic(tester).tooltip, 'Talk instead of typing');
    });

    testWidgets('a permanently blocked permission points at Settings',
        (tester) async {
      _sizeUp(tester);
      final speech =
          FakeSpeechService(outcome: SpeechStartOutcome.permissionBlocked);
      await tester.pumpWidget(_app(
          webSocketService: FakeWebSocketService(), speechService: speech));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('chat_mic')));
      await tester.pump();

      expect(find.text('Settings'), findsOneWidget);
    });

    testWidgets('a device without a recognizer says so instead of silently failing',
        (tester) async {
      _sizeUp(tester);
      final speech =
          FakeSpeechService(outcome: SpeechStartOutcome.unavailable);
      await tester.pumpWidget(_app(
          webSocketService: FakeWebSocketService(), speechService: speech));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('chat_mic')));
      await tester.pump();

      expect(find.text("Voice input isn't available on this device."),
          findsOneWidget);
    });

    testWidgets('the mic disappears once the session has ended', (tester) async {
      _sizeUp(tester);
      final ws = FakeWebSocketService();
      await tester.pumpWidget(_app(
        webSocketService: ws,
        speechService: FakeSpeechService(),
      ));
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('chat_mic')), findsOneWidget);

      ws.simulateSessionClosed('USER_REQUESTED');
      await tester.pump(const Duration(milliseconds: 500));

      expect(find.byKey(const ValueKey('chat_mic')), findsNothing);
    });

    testWidgets('closing the session mid-dictation stops the microphone',
        (tester) async {
      _sizeUp(tester);
      final ws = FakeWebSocketService();
      final speech = FakeSpeechService();
      await tester.pumpWidget(
          _app(webSocketService: ws, speechService: speech));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('chat_mic')));
      await tester.pump();

      ws.simulateSessionClosed('USER_REQUESTED');
      await tester.pump(const Duration(milliseconds: 500));

      // Recording must not continue behind a screen that can no longer show
      // or stop it.
      expect(speech.cancelCalls, greaterThanOrEqualTo(1));
    });

    testWidgets('leaving the chat releases the microphone', (tester) async {
      _sizeUp(tester);
      final speech = FakeSpeechService();
      await tester.pumpWidget(_app(
          webSocketService: FakeWebSocketService(), speechService: speech));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('chat_mic')));
      await tester.pump();

      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();

      expect(speech.disposeCalls, 1);
    });
  });
}
