import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';

import 'package:okuvu/src/config/app_config.dart';
import 'package:okuvu/src/features/home/home_screen.dart';
import 'package:okuvu/src/features/chat/chat_screen.dart';
import 'package:okuvu/src/features/progress/progress_screen.dart';
import 'package:okuvu/src/features/settings/settings_screen.dart';
import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/chat/models/agent_turn_frame.dart';
import 'package:okuvu/src/core/websocket_service.dart';
import 'package:okuvu/src/features/chat/models/grounding_result.dart';

class FakeWebSocketService implements WebSocketService {
  @override
  WsConnectionState currentState = WsConnectionState.disconnected;

  @override
  String? get sessionId => null;

  @override
  bool get showBanner => false;

  @override
  String? get errorType => null;

  @override
  Stream<WsConnectionState> get stateStream => const Stream.empty();

  @override
  Stream<String?> get errorTypeStream => const Stream.empty();

  @override
  Stream<AgentTurnFrame> get agentTurnStream => const Stream.empty();

  @override
  Stream<String?> get sessionClosedStream => const Stream.empty();

  @override
  Stream<bool> get showBannerStream => const Stream.empty();

  @override
  Stream<String?> get crisisSignalStream => const Stream.empty();

  @override
  Future<void> connect(
      {required String wsBaseUrl, required String token}) async {}

  @override
  void sendUserTurn(String content) {}

  @override
  void injectMockAgentTurn(String content) {}

  @override
  void retry() {}

  @override
  void disconnect() {}

  @override
  void dispose() {}

  @override
  void sendToolResult(GroundingResult result) {}
}

Dio _createMockDio() {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) {
      handler.resolve(Response(
        requestOptions: options,
        statusCode: 200,
        data: {'success': true},
      ));
    },
  ));
  return dio;
}

final _fakeWs = FakeWebSocketService();

Widget _buildHomeApp() {
  return ProviderScope(
    overrides: [
      webSocketServiceProvider.overrideWithValue(_fakeWs),
    ],
    child: MaterialApp.router(
      routerConfig: GoRouter(
        initialLocation: '/home',
        routes: [
          GoRoute(
            path: '/home',
            builder: (_, __) => const HomeScreen(),
          ),
          GoRoute(
            path: '/chat',
            builder: (_, __) => const ChatScreen(),
          ),
          GoRoute(
            path: '/progress',
            builder: (_, __) => const ProgressScreen(),
          ),
          GoRoute(
            path: '/settings',
            builder: (_, __) => const SettingsScreen(),
          ),
        ],
      ),
    ),
  );
}

void main() {
  AppConfig.init('dev');

  group('HomeScreen layout', () {
    testWidgets('renders bottom navigation tabs', (tester) async {
      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      expect(find.text('Home'), findsOneWidget);
      expect(find.text('Chat'), findsOneWidget);
      expect(find.text('Progress'), findsOneWidget);
      expect(find.text('Settings'), findsOneWidget);
    });

    testWidgets('renders from okuvu label', (tester) async {
      tester.view.physicalSize = const Size(1080, 1920);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      expect(find.text('FROM OKUVU'), findsOneWidget);
    });

    testWidgets('renders progress summary empty state', (tester) async {
      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      expect(find.text('How are you feeling today?'), findsOneWidget);
      expect(find.text('No mood check-ins yet'), findsOneWidget);
    });

    testWidgets('renders Insight card message', (tester) async {
      tester.view.physicalSize = const Size(1080, 1920);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      expect(
        find.text(
          'Your insights will appear here after your first check-in.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('renders AppBar with OKUVU title', (tester) async {
      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      expect(find.text('OKUVU'), findsOneWidget);
    });

    testWidgets('renders cleanly with no user data', (tester) async {
      tester.view.physicalSize = const Size(1080, 1920);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      expect(find.text('How are you feeling today?'), findsOneWidget);
      expect(
        find.text(
          'Your insights will appear here after your first check-in.',
        ),
        findsOneWidget,
      );
      expect(find.text('No mood check-ins yet'), findsOneWidget);
      expect(find.text('FROM OKUVU'), findsOneWidget);
      expect(find.text('Crisis Support'), findsOneWidget);
    });

    testWidgets('Crisis Support entry point is present', (tester) async {
      tester.view.physicalSize = const Size(1080, 1920);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      expect(find.text('Crisis Support'), findsOneWidget);
    });
  });

  group('HomeScreen navigation', () {
    testWidgets('Chat tab navigates to /chat', (tester) async {
      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      await tester.tap(find.text('Chat'));
      await tester.pumpAndSettle();

      expect(find.text('How are you feeling today?'), findsWidgets);
      expect(find.byIcon(Icons.chat_bubble_outline), findsOneWidget);
    });

    testWidgets('Progress tab navigates to /progress', (tester) async {
      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      await tester.tap(find.text('Progress'));
      await tester.pumpAndSettle();

      expect(find.text('Could not load your mood trend'), findsOneWidget);
    });

    testWidgets('Settings tab navigates to /settings', (tester) async {
      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      await tester.tap(find.text('Settings'));
      await tester.pumpAndSettle();

      expect(find.text('My Focus Area'), findsOneWidget);
      expect(find.text('Emergency Contact'), findsOneWidget);
    });
  });

  group('ChatScreen post-session-close return to home', () {
    testWidgets(
      'SESSION_CLOSED -> SRS modal -> Skip -> stays on ChatScreen',
      (tester) async {
        tester.view.physicalSize = const Size(1080, 1920);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        final fakeWs = FakeWebSocketService();

        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              webSocketServiceProvider.overrideWithValue(fakeWs),
            ],
            child: MaterialApp.router(
              routerConfig: GoRouter(
                initialLocation: '/chat',
                routes: [
                  GoRoute(
                    path: '/chat',
                    builder: (_, __) => const ChatScreen(),
                  ),
                  GoRoute(
                    path: '/home',
                    builder: (_, __) => const HomeScreen(),
                  ),
                ],
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(find.byType(ChatScreen), findsOneWidget);

        final container = ProviderScope.containerOf(
          tester.element(find.byType(ChatScreen)),
        );
        container.read(chatMessagesProvider.notifier).addUserMessage('Hello');
        await tester.pump();

        final current = container.read(chatMessagesProvider);
        container.read(chatMessagesProvider.notifier).state =
            current.copyWith(isSessionClosed: true);
        await tester.pump();

        await tester.pump(const Duration(milliseconds: 500));
        await tester.pumpAndSettle();

        expect(find.text('How was this session?'), findsOneWidget);

        await tester.ensureVisible(find.text('Skip'));
        await tester.tap(find.text('Skip'), warnIfMissed: false);
        await tester.pumpAndSettle();

        expect(find.byType(ChatScreen), findsOneWidget);
      },
    );

    testWidgets(
      'SESSION_CLOSED -> SRS modal -> Rate Helpful -> auto-dismisses',
      (tester) async {
        tester.view.physicalSize = const Size(1080, 1920);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        final fakeWs = FakeWebSocketService();

        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              webSocketServiceProvider.overrideWithValue(fakeWs),
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
                  GoRoute(
                    path: '/home',
                    builder: (_, __) => const HomeScreen(),
                  ),
                ],
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(find.byType(ChatScreen), findsOneWidget);

        final container = ProviderScope.containerOf(
          tester.element(find.byType(ChatScreen)),
        );
        container.read(chatMessagesProvider.notifier).addUserMessage('Hello');
        await tester.pump();

        final current = container.read(chatMessagesProvider);
        container.read(chatMessagesProvider.notifier).state =
            current.copyWith(isSessionClosed: true);
        await tester.pump();

        await tester.pump(const Duration(milliseconds: 500));
        await tester.pumpAndSettle();

        expect(find.text('How was this session?'), findsOneWidget);

        await tester.ensureVisible(find.text('Helpful'));
        await tester.tap(find.text('Helpful'), warnIfMissed: false);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 800));
        await tester.pumpAndSettle();

        expect(find.byType(ChatScreen), findsOneWidget);
      },
    );
  });
}
