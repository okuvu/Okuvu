import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/app_config.dart';
import '../../core/providers.dart';
import '../../core/websocket_service.dart';
import '../chat/models/agent_turn_frame.dart';
import 'intake_message.dart';

class IntakeState {
  final List<IntakeMessage> messages;
  final int turnCount;
  final bool isSending;
  final bool isComplete;
  final bool isReconnecting;
  final bool hasNavigated;
  final String? error;
  final WsConnectionState wsState;

  const IntakeState({
    required this.messages,
    required this.turnCount,
    required this.isSending,
    required this.isComplete,
    required this.isReconnecting,
    required this.hasNavigated,
    this.error,
    required this.wsState,
  });

  IntakeState.initial()
      : messages = const [
          IntakeMessage(
            role: 'assistant',
            content: "What's been weighing on your mind lately?",
            timestamp: null,
          ),
        ],
        turnCount = 0,
        isSending = false,
        isComplete = false,
        isReconnecting = false,
        hasNavigated = false,
        error = null,
        wsState = WsConnectionState.disconnected;

  IntakeState copyWith({
    List<IntakeMessage>? messages,
    int? turnCount,
    bool? isSending,
    bool? isComplete,
    bool? isReconnecting,
    bool? hasNavigated,
    String? error,
    bool clearError = false,
    WsConnectionState? wsState,
  }) {
    return IntakeState(
      messages: messages ?? this.messages,
      turnCount: turnCount ?? this.turnCount,
      isSending: isSending ?? this.isSending,
      isComplete: isComplete ?? this.isComplete,
      isReconnecting: isReconnecting ?? this.isReconnecting,
      hasNavigated: hasNavigated ?? this.hasNavigated,
      error: clearError ? null : (error ?? this.error),
      wsState: wsState ?? this.wsState,
    );
  }
}

final intakeProvider =
    NotifierProvider<IntakeNotifier, IntakeState>(IntakeNotifier.new);

class IntakeNotifier extends Notifier<IntakeState> {
  StreamSubscription<AgentTurnFrame>? _frameSub;
  StreamSubscription<WsConnectionState>? _stateSub;

  @override
  IntakeState build() {
    return IntakeState.initial();
  }

  Future<void> init() async {
    final authService = ref.read(authServiceProvider);
    final wsService = ref.read(webSocketServiceProvider);
    final token = await authService.getIdToken();

    if (token == null) {
      state = state.copyWith(
        error: 'Unable to authenticate. Please sign in again.',
      );
      return;
    }

    wsService.connect(wsBaseUrl: AppConfig.wsBaseUrl, token: token);

    _frameSub = wsService.agentTurnStream.listen(_onFrame);

    _stateSub = wsService.stateStream.listen((wsState) {
      state = state.copyWith(wsState: wsState);
    });
  }

  void sendMessage(String text) {
    if (state.isComplete || state.isSending || text.trim().isEmpty) return;

    if (state.wsState != WsConnectionState.sessionActive) {
      state = state.copyWith(
        error: 'Waiting for connection...',
        clearError: true,
      );
      return;
    }

    state = state.copyWith(
      messages: [
        ...state.messages,
        IntakeMessage(
          role: 'user',
          content: text.trim(),
          timestamp: DateTime.now(),
        ),
      ],
      isSending: true,
    );

    ref.read(webSocketServiceProvider).sendUserTurn(text.trim());
  }

  void _onFrame(AgentTurnFrame frame) {
    if (frame.isCrisis) {
      _onCrisisSignal();
      return;
    }

    final message = frame.content;
    if (message.isEmpty) return;

    final newTurnCount = state.turnCount + 1;
    final isComplete = newTurnCount >= 3;

    state = state.copyWith(
      messages: [
        ...state.messages,
        IntakeMessage(
          role: 'assistant',
          content: message,
          timestamp: DateTime.now(),
        ),
      ],
      turnCount: newTurnCount,
      isSending: false,
      isComplete: isComplete,
    );
  }
  void _onCrisisSignal() {
    state = state.copyWith(
      messages: [
        ...state.messages,
        IntakeMessage(
          role: 'assistant',
          content: "Let's take a moment.",
          timestamp: DateTime.now(),
        ),
      ],
      isSending: false,
      isComplete: true,
    );
  }

  void reconnect() async {
    state = state.copyWith(isReconnecting: true, error: null, clearError: true);

    final authService = ref.read(authServiceProvider);
    final wsService = ref.read(webSocketServiceProvider);
    final token = await authService.getIdToken();

    if (token == null) {
      state = state.copyWith(
        isReconnecting: false,
        error: 'Unable to authenticate. Please sign in again.',
      );
      return;
    }

    _frameSub?.cancel();
    _stateSub?.cancel();

    wsService.connect(wsBaseUrl: AppConfig.wsBaseUrl, token: token);

    _frameSub = wsService.agentTurnStream.listen(_onFrame);
    _stateSub = wsService.stateStream.listen((wsState) {
      state = state.copyWith(wsState: wsState);
    });
  }

  void cleanup() {
    _frameSub?.cancel();
    _stateSub?.cancel();
    ref.read(webSocketServiceProvider).disconnect();
  }
}