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
  void connect({required String wsBaseUrl, required String token}) {}

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
    testWidgets('renders Check In entry point', (tester) async {
      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      expect(find.text('Check In'), findsOneWidget);
    });

    testWidgets('renders Progress entry point', (tester) async {
      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      expect(find.text('Progress'), findsOneWidget);
    });

    testWidgets('renders Settings entry point', (tester) async {
      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      expect(find.text('Settings'), findsOneWidget);
    });

    testWidgets('renders Mood Check-In slot', (tester) async {
      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      expect(find.text('How are you feeling today?'), findsOneWidget);
      expect(find.byIcon(Icons.mood), findsOneWidget);
    });

    testWidgets('renders Insight slot', (tester) async {
      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      expect(find.text('Insights'), findsOneWidget);
      expect(find.text("I'm here when you're ready to talk."), findsOneWidget);
      expect(find.byIcon(Icons.lightbulb_outline), findsOneWidget);
    });

    testWidgets('renders AppBar with Evia title', (tester) async {
      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      expect(find.text('Evia'), findsOneWidget);
    });

    testWidgets('renders cleanly with no user data', (tester) async {
      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      expect(find.text('Check In'), findsOneWidget);
      expect(find.text('Progress'), findsOneWidget);
      expect(find.text('Settings'), findsOneWidget);
      expect(find.text('How are you feeling today?'), findsOneWidget);
      expect(find.text('Insights'), findsOneWidget);
      expect(find.text("I'm here when you're ready to talk."), findsOneWidget);
      expect(find.byIcon(Icons.mood), findsOneWidget);
      expect(find.byIcon(Icons.lightbulb_outline), findsOneWidget);
    });

    testWidgets('Crisis Support entry point is present', (tester) async {
      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      expect(find.text('Crisis Support'), findsOneWidget);
    });
  });

  group('HomeScreen navigation', () {
    testWidgets('Check In navigates to /chat', (tester) async {
      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      await tester.tap(find.text('Check In'));
      await tester.pumpAndSettle();

      // ChatScreen renders with its characteristic empty state text
      expect(find.text('How are you feeling today?'), findsWidgets);
      expect(find.byIcon(Icons.chat_bubble_outline), findsOneWidget);
    });

    testWidgets('Progress navigates to /progress', (tester) async {
      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      await tester.tap(find.text('Progress'));
      await tester.pumpAndSettle();

      expect(find.text('Could not load your mood trend'), findsOneWidget);
    });

    testWidgets('Settings navigates to /settings', (tester) async {
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

        // SRS modal should be visible
        expect(find.text('Session Feedback'), findsOneWidget);

        // Tap Skip to dismiss the modal
        await tester.ensureVisible(find.text('Skip'));
        await tester.tap(find.text('Skip'), warnIfMissed: false);
        await tester.pumpAndSettle();

        // Should navigate to /home
        expect(find.byType(HomeScreen), findsOneWidget);
        expect(find.text('Check In'), findsOneWidget);
      },
    );

    testWidgets(
      'SESSION_CLOSED -> SRS modal Submit -> navigates to /home',
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

        expect(find.text('Session Feedback'), findsOneWidget);

        // Tap Submit to dismiss the modal
        await tester.ensureVisible(find.text('Submit'));
        await tester.tap(find.text('Submit'), warnIfMissed: false);
        await tester.pumpAndSettle();

        // Should navigate to /home
        expect(find.byType(HomeScreen), findsOneWidget);
        expect(find.text('Check In'), findsOneWidget);
      },
    );
  });
}
