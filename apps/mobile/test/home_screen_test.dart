import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
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
import 'package:okuvu/src/core/auth_service.dart';
import 'package:okuvu/src/features/chat/models/agent_turn_frame.dart';
import 'package:okuvu/src/core/websocket_service.dart';
import 'package:okuvu/src/features/chat/models/grounding_result.dart';
import 'package:firebase_auth/firebase_auth.dart';

/// AuthService's constructor eagerly touches FirebaseAuth.instance, which
/// throws in a test environment with no real Firebase app — ChatScreen
/// reads authServiceProvider directly (for the WS auth token), so it needs
/// a Firebase-free fake here, same as otp_login_screen_test.dart's.
class FakeAuthService implements AuthService {
  @override
  User? get currentUser => null;

  @override
  Future<String?> getIdToken() async => 'fake-id-token';

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
      authServiceProvider.overrideWithValue(FakeAuthService()),
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

      // Wireframe's 3-tab nav (Home/Chat/Journal) — Progress and Settings
      // moved to AppBar icon buttons instead (checked separately below).
      // "Journal" also appears as a Home quick-access tile label, so scope
      // to the NavigationBar itself.
      final navBar = find.byType(NavigationBar);
      expect(find.descendant(of: navBar, matching: find.text('Home')), findsOneWidget);
      expect(find.descendant(of: navBar, matching: find.text('Chat')), findsOneWidget);
      expect(find.descendant(of: navBar, matching: find.text('Journal')), findsOneWidget);
    });

    testWidgets('renders Progress and Settings as AppBar icons', (tester) async {
      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      expect(
        find.descendant(of: find.byType(AppBar), matching: find.byIcon(LucideIcons.barChart2)),
        findsOneWidget,
      );
      expect(
        find.descendant(of: find.byType(AppBar), matching: find.byIcon(LucideIcons.settings)),
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

      // Wireframe: no care plan, focus label, streaks, or counters ever
      // displayed on Home — ProgressSummary/HomeInsightCard/AffirmationCard
      // were removed, so this just checks the screen still renders cleanly.
      expect(find.text('How are you feeling today?'), findsOneWidget);
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

    testWidgets('greeting includes the display abbreviation once /users/me/today returns one', (tester) async {
      tester.view.physicalSize = const Size(1080, 1920);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
      dio.interceptors.add(InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.path.endsWith('/users/me/today')) {
            handler.resolve(Response(
              requestOptions: options,
              statusCode: 200,
              data: {'displayAbbreviation': 'Zee'},
            ));
            return;
          }
          handler.resolve(Response(requestOptions: options, statusCode: 200, data: {'success': true}));
        },
      ));

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            webSocketServiceProvider.overrideWithValue(_fakeWs),
            authServiceProvider.overrideWithValue(FakeAuthService()),
            dioClientProvider.overrideWithValue(dio),
          ],
          child: const MaterialApp(home: HomeScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining(', Zee'), findsOneWidget);
    });

    testWidgets('greeting falls back to the plain time-of-day text with no display abbreviation', (tester) async {
      tester.view.physicalSize = const Size(1080, 1920);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      final hour = DateTime.now().hour;
      final expected = hour < 12
          ? 'Good morning'
          : hour < 17
              ? 'Good afternoon'
              : 'Good evening';
      expect(find.text(expected), findsOneWidget);
    });
  });

  group('HomeScreen navigation', () {
    testWidgets('Chat tab navigates to /chat', (tester) async {
      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      await tester.tap(find.text('Chat'));
      await tester.pumpAndSettle();

      expect(find.text('How are you feeling today?'), findsWidgets);
      expect(
        find.descendant(
          of: find.byType(NavigationBar),
          matching: find.byIcon(LucideIcons.messageCircle),
        ),
        findsOneWidget,
      );
    });

    testWidgets('Progress icon navigates to /progress', (tester) async {
      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      await tester.tap(find.descendant(
        of: find.byType(AppBar),
        matching: find.byIcon(LucideIcons.barChart2),
      ));
      await tester.pumpAndSettle();

      expect(find.text('Could not load your mood trend'), findsOneWidget);
    });

    testWidgets('Settings icon navigates to /settings', (tester) async {
      await tester.pumpWidget(_buildHomeApp());
      await tester.pumpAndSettle();

      await tester.tap(find.descendant(
        of: find.byType(AppBar),
        matching: find.byIcon(LucideIcons.settings),
      ));
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
