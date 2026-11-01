import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:okuvu/src/app.dart';
import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/core/tts_service.dart';
import 'package:okuvu/src/core/websocket_service.dart';
import 'package:okuvu/src/features/chat/chat_screen.dart';
import 'package:okuvu/src/router/router.dart';

import 'fake_auth_service.dart';

/// A [WebSocketService] with no socket behind it.
///
/// Everything the chat does with a frame — the `_onMessage` switch, the JSON
/// parse, the `CRISIS_SIGNAL` branch, the notifier listeners, the widget tree —
/// is the real production code. The only thing removed is the socket: `connect`
/// and `disconnect` do nothing, so a widget test drives frames with
/// [handleRawFrame] and nothing ever touches the network.
class FrameDrivenWebSocketService extends WebSocketService {
  int connectCallCount = 0;
  int disconnectCallCount = 0;

  @override
  Future<void> connect(
      {required String wsBaseUrl, required String token}) async {
    connectCallCount++;
  }

  @override
  void disconnect() {
    disconnectCallCount++;
  }

  @override
  void retry() {}
}

/// The exact frame shapes `apps/api/src/routes/websocket.ts` writes.
String openSessionFrame({String sessionId = 'session-under-test'}) =>
    jsonEncode({
      'type': 'SESSION_OPEN_CONFIRMED',
      'payload': {'session_id': sessionId},
    });

String agentTurnFrame({
  required String message,
  Map<String, dynamic>? safety,
  String? turnId = 'turn-1',
  int turnCount = 1,
  Map<String, dynamic>? toolCard,
  String? journalPromptSuggested,
}) =>
    jsonEncode({
      'type': 'AGENT_TURN',
      'payload': {
        'session_id': 'session-under-test',
        'message': message,
        'turn_count': turnCount,
        'turn_id': turnId,
        'tts_url': null,
        if (toolCard != null) 'tool_card': toolCard,
        if (journalPromptSuggested != null)
          'journal_prompt_suggested': journalPromptSuggested,
        if (safety != null) 'safety': safety,
      },
    });

String agentTurnFrameWithoutMessage({Map<String, dynamic>? safety}) =>
    jsonEncode({
      'type': 'AGENT_TURN',
      'payload': {
        'session_id': 'session-under-test',
        'turn_count': 1,
        'turn_id': 'turn-1',
        'tts_url': null,
        if (safety != null) 'safety': safety,
      },
    });

String crisisSignalFrame({
  String message = '',
  Map<String, dynamic>? safety,
}) =>
    jsonEncode({
      'type': 'CRISIS_SIGNAL',
      'payload': {
        'session_id': 'session-under-test',
        if (message.isNotEmpty) 'message': message,
        if (safety != null) 'safety': safety,
      },
    });

/// Dio that answers every request locally — no network, no plugin channels.
Dio offlineDio() {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        if (options.path == '/settings/voice') {
          handler.resolve(Response(
            requestOptions: options,
            statusCode: 200,
            data: {'voice_enabled': false},
          ));
          return;
        }
        if (options.path == '/users/me/today') {
          handler.resolve(Response(
            requestOptions: options,
            statusCode: 200,
            data: {'careEnded': false},
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

class SilentTtsService extends TtsService {
  @override
  Future<bool> isLanguageAvailable() async => true;

  @override
  Future<void> setVoiceEnabled(bool value) async {}

  @override
  Future<void> speak(String text) async {}

  @override
  Future<void> stop() async {}
}

/// flutter_riverpod 3.3.2 does not export the `Override` type, so the list
/// literal has to be written where `ProviderScope` can infer it.
Widget _scope({required WebSocketService ws, required Widget child}) =>
    ProviderScope(
      overrides: [
        webSocketServiceProvider.overrideWithValue(ws),
        ttsServiceProvider.overrideWithValue(SilentTtsService()),
        dioClientProvider.overrideWithValue(offlineDio()),
        authServiceProvider.overrideWithValue(FakeAuthService()),
        // The app-wide router builds splash/onboarding redirects off auth state;
        // a plain two-route router keeps the widget under test the only variable.
        routerConfigProvider.overrideWithValue(
          GoRouter(
            initialLocation: '/chat',
            routes: [
              GoRoute(path: '/chat', builder: (_, __) => const ChatScreen()),
              GoRoute(
                path: '/home',
                builder: (_, __) => const Scaffold(body: Text('home')),
              ),
            ],
          ),
        ),
      ],
      child: child,
    );

/// Pumps the real [App] — router, `_CrisisOverlaySlot` and all — around the
/// chat screen. This is the production path a CRISIS_SIGNAL frame takes to the
/// user's eyes; nothing about the overlay is re-built in the test.
Future<ProviderContainer> pumpOkuvuApp(
  WidgetTester tester, {
  required WebSocketService ws,
}) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(_scope(ws: ws, child: const App()));
  await tester.pumpAndSettle();
  return ProviderScope.containerOf(tester.element(find.byType(ChatScreen)));
}

/// Pumps the chat screen on its own, for assertions that are about the
/// transcript rather than the app-wide overlay.
Future<ProviderContainer> pumpChatScreen(
  WidgetTester tester, {
  required WebSocketService ws,
}) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    _scope(
      ws: ws,
      child: const MaterialApp(home: ChatScreen()),
    ),
  );
  await tester.pumpAndSettle();
  return ProviderScope.containerOf(tester.element(find.byType(ChatScreen)));
}

/// Asserts [expected] is on screen as one visible, untruncated paragraph whose
/// laid-out text is *exactly* [expected] — not a prefix of it.
///
/// A `find.text` match alone only proves the string reached a widget; it says
/// nothing about whether the widget was allowed to cut it off. This checks the
/// three ways safety copy is lost in a client: the string never arriving, the
/// Text being configured to ellipsize, and the paragraph actually overflowing
/// its box.
void expectVisibleAndComplete(WidgetTester tester, String expected) {
  final finder = find.text(expected);
  expect(
    finder,
    findsOneWidget,
    reason: 'expected the served copy to be rendered verbatim as a Text widget',
  );

  final text = tester.widget<Text>(finder);
  expect(text.maxLines, isNull,
      reason: 'a safety message must not cap its own line count');
  expect(text.overflow, isNot(TextOverflow.ellipsis),
      reason: 'a safety message must not be configured to ellipsize');

  final richText = find.descendant(of: finder, matching: find.byType(RichText));
  final paragraph = tester.renderObject<RenderParagraph>(richText.first);
  expect(paragraph.text.toPlainText(), expected,
      reason: 'the rendered paragraph must carry every character');
  expect(paragraph.size.height, greaterThan(0),
      reason: 'the paragraph must have laid out with height');

  final rect = tester.getRect(finder);
  final screen =
      Offset.zero & tester.view.physicalSize / tester.view.devicePixelRatio;
  expect(rect.height, greaterThan(0));
  expect(screen.contains(rect.topLeft), isTrue,
      reason: 'the message must start inside the visible viewport');
}

/// The rendered plain text of every paragraph currently in the tree — used to
/// prove digits survive rendering rather than relying on a whole-string match.
List<String> renderedParagraphs(WidgetTester tester) => tester
    .widgetList<RichText>(find.byType(RichText))
    .map((w) => w.text.toPlainText())
    .toList();

/// The laid-out text of the single paragraph showing [expected].
String renderedTextFor(WidgetTester tester, String expected) {
  final richText = find.descendant(
    of: find.text(expected),
    matching: find.byType(RichText),
  );
  return tester
      .renderObject<RenderParagraph>(richText.first)
      .text
      .toPlainText();
}
