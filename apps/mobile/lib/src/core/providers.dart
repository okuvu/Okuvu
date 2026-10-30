import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'websocket_service.dart';
import 'auth_service.dart';
import 'dio_client.dart';
import 'auth_interceptor.dart';
import 'tts_service.dart';
import 'speech_service.dart';
import 'analytics_service.dart';
import '../features/chat/models/agent_turn_frame.dart';
import '../features/chat/models/chat_message.dart';
import '../features/chat/models/chat_state.dart';
import '../features/settings/voice_settings_notifier.dart';

export '../features/settings/voice_settings_notifier.dart'
    show voiceSettingsProvider, voiceSettingsStateProvider;
export '../features/settings/emergency_contact_notifier.dart'
    show emergencyContactProvider;
export '../features/settings/consent_provider.dart' show consentProvider;
export '../features/intake/care_plan_provider.dart' show userCarePlanProvider;
export '../features/intake/onboarding_provider.dart'
    show hasCompletedOnboardingProvider;
export '../features/journal/journal_provider.dart'
    show journalListProvider, journalEntryFormProvider;

class CrisisOverlayNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  void show() => state = true;
  void hide() => state = false;
}

final authServiceProvider = Provider<AuthService>((ref) => AuthService());
final ttsServiceProvider = Provider<TtsService>((ref) => TtsService());
final speechServiceProvider = Provider<SpeechService>((ref) => SpeechService());
final analyticsServiceProvider =
    Provider<AnalyticsService>((ref) => AnalyticsService());
final crisisOverlayProvider =
    NotifierProvider<CrisisOverlayNotifier, bool>(CrisisOverlayNotifier.new);

final authStateProvider = StreamProvider<AuthUser?>((ref) {
  return ref.watch(authServiceProvider).authStateChanges();
});

enum SessionState { initial, authenticated, unauthenticated }

final sessionProvider = Provider<SessionState>((ref) {
  final authState = ref.watch(authStateProvider);
  return authState.when(
    data: (user) => user != null
        ? SessionState.authenticated
        : SessionState.unauthenticated,
    loading: () => SessionState.initial,
    error: (_, __) => SessionState.unauthenticated,
  );
});

final dioClientProvider = Provider<Dio>((ref) {
  final dio = createDioClient();
  dio.interceptors
      .add(AuthInterceptor(ref.read(authServiceProvider), dio.options));
  return dio;
});

final connectivityProvider = StreamProvider<bool>((ref) {
  return Connectivity().onConnectivityChanged.map(
        (results) => results.any((r) => r != ConnectivityResult.none),
      );
});

final isOnlineProvider = Provider<bool>((ref) {
  return ref.watch(connectivityProvider).value ?? true;
});

final webSocketServiceProvider = Provider<WebSocketService>((ref) {
  return WebSocketService();
});

class WsConnectionStateNotifier extends Notifier<WsConnectionState> {
  StreamSubscription<WsConnectionState>? _sub;

  @override
  WsConnectionState build() {
    final ws = ref.watch(webSocketServiceProvider);
    _sub = ws.stateStream.listen((s) => state = s);
    ref.onDispose(() => _sub?.cancel());
    return ws.currentState;
  }
}

final wsConnectionStateProvider =
    NotifierProvider<WsConnectionStateNotifier, WsConnectionState>(
        WsConnectionStateNotifier.new);

class WsShowBannerNotifier extends Notifier<bool> {
  StreamSubscription<bool>? _sub;

  @override
  bool build() {
    final ws = ref.watch(webSocketServiceProvider);
    _sub = ws.showBannerStream.listen((show) => state = show);
    ref.onDispose(() => _sub?.cancel());
    return ws.showBanner;
  }
}

final wsShowBannerProvider =
    NotifierProvider<WsShowBannerNotifier, bool>(WsShowBannerNotifier.new);

class ChatNotifier extends Notifier<ChatState> {
  StreamSubscription<AgentTurnFrame>? _turnSub;
  StreamSubscription<String?>? _sessionSub;
  StreamSubscription<CrisisSignal>? _crisisSub;

  StreamSubscription<WsConnectionState>? _connectionSub;

  @override
  ChatState build() {
    final ws = ref.watch(webSocketServiceProvider);
    _turnSub = ws.agentTurnStream.listen(_onAgentTurn);
    _sessionSub = ws.sessionClosedStream.listen((reason) {
      // okuvu-remaining-changes.md §B.2: an idle-timeout close is a silent
      // runaway bound — WebSocketService already quietly reopens a fresh
      // thread for it, so the UI must not show the "session ended" screen
      // (or trigger the SRS modal) for that specific reason. Any other
      // reason (user-requested, unknown) keeps today's behavior.
      if (reason == 'IDLE_TIMEOUT') return;
      state = state.copyWith(isSessionClosed: true);
    });
    _crisisSub = ws.crisisSignalStream.listen((signal) {
      // E17-S11: the S4 reply the api sent with the frame goes into the
      // transcript before the card covers the screen, so dismissing the card
      // ("I'm safe for now") does not leave the user's last message with no
      // assistant reply under it. It also settles the pending-turn state: the
      // chat screen clears its typing indicator on any new agent message, so
      // the 20s "No response received. Please try again." timer no longer
      // fires behind a crisis card.
      if (signal.message.trim().isNotEmpty) {
        final id = 'crisis-${signal.sessionId ?? 'session'}';
        if (!state.messages.any((m) => m.id == id)) {
          state = state.copyWith(
            messages: [
              ...state.messages,
              ChatMessage(
                id: id,
                sender: MessageSender.agent,
                content: signal.message,
                timestamp: DateTime.now(),
              ),
            ],
          );
        }
      }
      ref.read(crisisOverlayProvider.notifier).show();
    });
    // A prior session closing is only ever recorded (isSessionClosed: true)
    // above, never cleared — nothing else in this notifier resets it, so a
    // brand-new session opening after one closed left the chat UI locked on
    // "This session has ended" for the rest of the app's lifetime. Reconnects
    // to a still-open session also emit sessionActive, so only reset when the
    // previous state genuinely was closed, not on every reconnect blip.
    _connectionSub = ws.stateStream.listen((wsState) {
      if (wsState == WsConnectionState.sessionActive && state.isSessionClosed) {
        state = const ChatState(messages: []);
      }
    });
    ref.onDispose(() {
      _turnSub?.cancel();
      _sessionSub?.cancel();
      _crisisSub?.cancel();
      _connectionSub?.cancel();
    });
    return const ChatState(messages: []);
  }

  void _onAgentTurn(AgentTurnFrame frame) {
    if (frame.turnId != null && state.messages.any((m) => m.id == frame.turnId)) {
      return;
    }

    state = state.copyWith(
      messages: [
        ...state.messages,
        ChatMessage(
          id: frame.turnId ?? DateTime.now().toIso8601String(),
          sender: MessageSender.agent,
          content: frame.content,
          timestamp: DateTime.now(),
          toolCard: frame.toolCard,
          journalPromptSuggested: frame.journalPromptSuggested,
        ),
      ],
      turnCount: frame.turnCount,
    );

    ref.read(ttsServiceProvider).speak(frame.content);
  }

  void addUserMessage(String content) {
    state = state.copyWith(
      messages: [
        ...state.messages,
        ChatMessage(
          id: DateTime.now().toIso8601String(),
          sender: MessageSender.user,
          content: content,
          timestamp: DateTime.now(),
        ),
      ],
    );
  }

  void setSessionFeedback(int score) {
    state = state.copyWith(sessionFeedback: () => score);
  }
}

final chatMessagesProvider =
    NotifierProvider<ChatNotifier, ChatState>(ChatNotifier.new);

final sessionIdProvider = Provider<String?>((ref) {
  return ref.watch(webSocketServiceProvider).sessionId;
});

final voiceSyncProvider = Provider<void>((ref) {
  final voiceSettings = ref.watch(voiceSettingsStateProvider);
  final ttsService = ref.read(ttsServiceProvider);
  ttsService.setVoiceEnabled(voiceSettings.voiceEnabled);
});
