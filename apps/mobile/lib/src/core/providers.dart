import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'auth_service.dart';
import 'dio_client.dart';
import 'auth_interceptor.dart';
import 'tts_service.dart';
import 'websocket_service.dart';
import '../features/chat/models/agent_turn_frame.dart';
import '../features/chat/models/chat_message.dart';

class CrisisOverlayNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  void show() => state = true;
  void hide() => state = false;
}

final authServiceProvider = Provider<AuthService>((ref) => AuthService());
final ttsServiceProvider = Provider<TtsService>((ref) => TtsService());
final crisisOverlayProvider = NotifierProvider<CrisisOverlayNotifier, bool>(CrisisOverlayNotifier.new);

final authStateProvider = StreamProvider<User?>((ref) {
  return FirebaseAuth.instance.authStateChanges();
});

enum SessionState { initial, authenticated, unauthenticated }

final sessionProvider = Provider<SessionState>((ref) {
  final authState = ref.watch(authStateProvider);
  return authState.when(
    data: (user) => user != null ? SessionState.authenticated : SessionState.unauthenticated,
    loading: () => SessionState.initial,
    error: (_, __) => SessionState.unauthenticated,
  );
});

final dioClientProvider = Provider<Dio>((ref) {
  final dio = createDioClient();
  dio.interceptors.add(AuthInterceptor(ref.read(authServiceProvider), dio.options));
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

class ChatNotifier extends Notifier<List<ChatMessage>> {
  StreamSubscription<AgentTurnFrame>? _subscription;

  @override
  List<ChatMessage> build() {
    final ws = ref.watch(webSocketServiceProvider);
    _subscription = ws.agentTurnStream.listen(_onAgentTurn);
    ref.onDispose(() => _subscription?.cancel());
    return [];
  }

  void _onAgentTurn(AgentTurnFrame frame) {
    if (frame.isCrisis) {
      ref.read(crisisOverlayProvider.notifier).show();
      return;
    }
    state = [
      ...state,
      ChatMessage(
        id: frame.turnId ?? DateTime.now().toIso8601String(),
        sender: MessageSender.agent,
        content: frame.content,
        timestamp: DateTime.now(),
      ),
    ];
  }

  void addUserMessage(String content) {
    state = [
      ...state,
      ChatMessage(
        id: DateTime.now().toIso8601String(),
        sender: MessageSender.user,
        content: content,
        timestamp: DateTime.now(),
      ),
    ];
  }
}

final chatMessagesProvider = NotifierProvider<ChatNotifier, List<ChatMessage>>(ChatNotifier.new);
