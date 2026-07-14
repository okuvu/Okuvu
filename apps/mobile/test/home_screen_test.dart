import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';

import 'package:evia/src/config/app_config.dart';
import 'package:evia/src/features/home/home_screen.dart';
import 'package:evia/src/features/chat/chat_screen.dart';
import 'package:evia/src/features/progress/progress_screen.dart';
import 'package:evia/src/features/settings/settings_screen.dart';
import 'package:evia/src/core/providers.dart';
import 'package:evia/src/features/chat/models/agent_turn_frame.dart';
import 'package:evia/src/core/websocket_service.dart';

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
  Stream<void> get sessionClosedStream => const Stream.empty();

  @override
  Stream<bool> get showBannerStream => const Stream.empty();

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

Widget _buildHomeApp() {
  return ProviderScope(
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

    testWidgets('renders from evia label', (tester) async {
      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      expect(find.text('FROM EVIA'), findsOneWidget);
    });

    testWidgets('renders progress summary empty state', (tester) async {
      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      expect(find.text('How are you feeling today?'), findsOneWidget);
      expect(find.text('No mood check-ins yet'), findsOneWidget);
    });

    testWidgets('renders Insight card message', (tester) async {
      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      expect(
        find.text(
          'Your insights will appear here after your first check-in.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('renders AppBar with Evia title', (tester) async {
      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      expect(find.text('Evia'), findsOneWidget);
    });

    testWidgets('renders cleanly with no user data', (tester) async {
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
      expect(find.text('FROM EVIA'), findsOneWidget);
      expect(find.text('Crisis Support'), findsOneWidget);
    });

    testWidgets('Crisis Support entry point is present', (tester) async {
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

      // ChatScreen renders with its characteristic empty state text
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

      expect(find.text('Profile'), findsOneWidget);
      expect(find.text('Notifications'), findsOneWidget);
    });
  });

  group('ChatScreen post-session-close return to home', () {
    testWidgets(
      'SESSION_CLOSED -> SRS modal -> Skip -> navigates to /home',
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

        // Verify we are on ChatScreen
        expect(find.byType(ChatScreen), findsOneWidget);

        // Add a user message so the chat isn't empty
        final container = ProviderScope.containerOf(
          tester.element(find.byType(ChatScreen)),
        );
        container.read(chatMessagesProvider.notifier).addUserMessage('Hello');
        await tester.pump();

        // Trigger session closed state transition
        final current = container.read(chatMessagesProvider);
        container.read(chatMessagesProvider.notifier).state =
            current.copyWith(isSessionClosed: true);
        await tester.pump();

        // Wait for the 400ms delay + modal to appear
        await tester.pump(const Duration(milliseconds: 500));
        await tester.pumpAndSettle();

        // SRS modal should be visible with the title
        expect(find.text('How was this session?'), findsOneWidget);

        // Tap Skip to dismiss the modal
        await tester.ensureVisible(find.text('Skip'));
        await tester.tap(find.text('Skip'), warnIfMissed: false);
        await tester.pumpAndSettle();

        // Tap "Back to Home" button on the chat screen to navigate
        await tester.ensureVisible(find.text('Back to Home'));
        await tester.tap(find.text('Back to Home'));
        await tester.pumpAndSettle();

        // Should navigate to /home
        expect(find.byType(HomeScreen), findsOneWidget);
        expect(find.text('How are you feeling today?'), findsOneWidget);
      },
    );

    testWidgets(
      'SESSION_CLOSED -> SRS modal tap option -> confirmation -> dismiss -> navigates to /home',
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

        // SRS modal should be visible
        expect(find.text('How was this session?'), findsOneWidget);

        // Tap the "Helpful" option
        await tester.ensureVisible(find.text('Helpful'));
        await tester.tap(find.text('Helpful'), warnIfMissed: false);
        await tester.pump();

        // Wait for confirmation delay (400ms) and confirmation to appear
        await tester.pump(const Duration(milliseconds: 500));

        // Confirmation screen should show "Got it"
        expect(find.text('Got it'), findsOneWidget);

        // Wait for auto-dismiss (800ms confirmation duration)
        await tester.pump(const Duration(milliseconds: 900));
        await tester.pumpAndSettle();

        // Tap "Back to Home" button on the chat screen to navigate
        await tester.ensureVisible(find.text('Back to Home'));
        await tester.tap(find.text('Back to Home'));
        await tester.pumpAndSettle();

        // Should navigate to /home
        expect(find.byType(HomeScreen), findsOneWidget);
        expect(find.text('How are you feeling today?'), findsOneWidget);
      },
    );
  });
}
