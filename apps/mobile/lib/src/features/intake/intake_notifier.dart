import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/providers.dart';
import '../../core/websocket_service.dart';
import '../chat/models/agent_turn_frame.dart';
import '../chat/models/chat_message.dart';

enum IntakeStep {
  waitingForOpeningMessage,
  turn1Active,
  waitingForTurn1Reply,
  turn2Active,
  waitingForTurn2Reply,
  turn3Active,
  waitingForTurn3Reply,
  complete,
}

class IntakeState {
  final IntakeStep step;
  final List<ChatMessage> messages;
  final bool isComplete;

  const IntakeState({
    required this.step,
    required this.messages,
    required this.isComplete,
  });

  IntakeState.initial()
      : step = IntakeStep.waitingForOpeningMessage,
        messages = const [],
        isComplete = false;

  IntakeState copyWith({
    IntakeStep? step,
    List<ChatMessage>? messages,
    bool? isComplete,
  }) {
    return IntakeState(
      step: step ?? this.step,
      messages: messages ?? this.messages,
      isComplete: isComplete ?? this.isComplete,
    );
  }

  int get progressFilledSegments {
    switch (step) {
      case IntakeStep.waitingForOpeningMessage:
        return 0;
      case IntakeStep.turn1Active:
        return 1;
      case IntakeStep.waitingForTurn1Reply:
        return 1;
      case IntakeStep.turn2Active:
        return 2;
      case IntakeStep.waitingForTurn2Reply:
        return 2;
      case IntakeStep.turn3Active:
        return 3;
      case IntakeStep.waitingForTurn3Reply:
        return 3;
      case IntakeStep.complete:
        return 3;
    }
  }

  bool get isInputEnabled {
    switch (step) {
      case IntakeStep.turn1Active:
      case IntakeStep.turn2Active:
      case IntakeStep.turn3Active:
        return true;
      default:
        return false;
    }
  }

  bool get isWaitingForReply {
    switch (step) {
      case IntakeStep.waitingForTurn1Reply:
      case IntakeStep.waitingForTurn2Reply:
      case IntakeStep.waitingForTurn3Reply:
        return true;
      default:
        return false;
    }
  }
}

final intakeProvider =
    NotifierProvider<IntakeNotifier, IntakeState>(IntakeNotifier.new);

class IntakeNotifier extends Notifier<IntakeState> {
  StreamSubscription<AgentTurnFrame>? _turnSub;
  StreamSubscription<void>? _sessionClosedSub;
  StreamSubscription<WsConnectionState>? _stateSub;
  int _onboardingTurnCount = 0;
  bool _hasConnectedOnce = false;

  @override
  IntakeState build() {
    final ws = ref.watch(webSocketServiceProvider);
    _turnSub = ws.agentTurnStream.listen(_onAgentTurn);
    _sessionClosedSub = ws.sessionClosedStream.listen((_) {
      _scheduleCompletion();
    });
    _stateSub = ws.stateStream.listen((wsState) {
      if (wsState == WsConnectionState.sessionActive) {
        if (_hasConnectedOnce && !state.isComplete) {
          _onboardingTurnCount = 0;
          state = IntakeState.initial();
        }
        _hasConnectedOnce = true;
      }
    });

    ref.onDispose(() {
      _turnSub?.cancel();
      _sessionClosedSub?.cancel();
      _stateSub?.cancel();
    });

    return IntakeState.initial();
  }

  void connectToWebSocket({required String wsBaseUrl, required String token}) {
    final ws = ref.read(webSocketServiceProvider);
    ws.connect(wsBaseUrl: wsBaseUrl, token: token);
  }

  void _onAgentTurn(AgentTurnFrame frame) {
    if (state.isComplete) return;

    final message = ChatMessage(
      id: frame.turnId ?? DateTime.now().toIso8601String(),
      sender: MessageSender.agent,
      content: frame.content,
      timestamp: DateTime.now(),
    );

    if (_onboardingTurnCount == 0) {
      state = state.copyWith(
        messages: [...state.messages, message],
        step: IntakeStep.turn1Active,
      );
    } else if (_onboardingTurnCount == 1) {
      state = state.copyWith(
        messages: [...state.messages, message],
        step: IntakeStep.turn2Active,
      );
    } else if (_onboardingTurnCount == 2) {
      state = state.copyWith(
        messages: [...state.messages, message],
        step: IntakeStep.turn3Active,
      );
    } else if (_onboardingTurnCount == 3) {
      state = state.copyWith(
        messages: [...state.messages, message],
        step: IntakeStep.waitingForTurn3Reply,
      );
      _scheduleCompletion();
    }
  }

  void sendResponse(String text) {
    if (!state.isInputEnabled) return;
    if (text.trim().isEmpty) return;

    final ws = ref.read(webSocketServiceProvider);

    final message = ChatMessage(
      id: DateTime.now().toIso8601String(),
      sender: MessageSender.user,
      content: text,
      timestamp: DateTime.now(),
    );

    _onboardingTurnCount++;

    IntakeStep nextStep;
    if (_onboardingTurnCount == 1) {
      nextStep = IntakeStep.waitingForTurn1Reply;
    } else if (_onboardingTurnCount == 2) {
      nextStep = IntakeStep.waitingForTurn2Reply;
    } else {
      nextStep = IntakeStep.waitingForTurn3Reply;
    }

    state = state.copyWith(
      messages: [...state.messages, message],
      step: nextStep,
    );

    ws.sendUserTurn(text);
  }

  void _scheduleCompletion() {
    Future.delayed(const Duration(milliseconds: 500), () {
      state = state.copyWith(
        step: IntakeStep.complete,
        isComplete: true,
      );
    });
  }

  void reset() {
    _onboardingTurnCount = 0;
    _hasConnectedOnce = false;
    _turnSub?.cancel();
    _sessionClosedSub?.cancel();
    _stateSub?.cancel();
    final ws = ref.read(webSocketServiceProvider);
    _turnSub = ws.agentTurnStream.listen(_onAgentTurn);
    _sessionClosedSub = ws.sessionClosedStream.listen((_) {
      _scheduleCompletion();
    });
    _stateSub = ws.stateStream.listen((wsState) {
      if (wsState == WsConnectionState.sessionActive) {
        if (_hasConnectedOnce && !state.isComplete) {
          _onboardingTurnCount = 0;
          state = IntakeState.initial();
        }
        _hasConnectedOnce = true;
      }
    });
    state = IntakeState.initial();
  }
}