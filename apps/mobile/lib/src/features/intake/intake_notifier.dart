import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'intake_message.dart';

class IntakeState {
  final int step;
  final List<IntakeMessage> messages;
  final String? selectedCarePlan;
  final bool isCompleting;
  final bool isComplete;

  const IntakeState({
    required this.step,
    required this.messages,
    this.selectedCarePlan,
    required this.isCompleting,
    required this.isComplete,
  });

  IntakeState.initial()
      : step = 1,
        messages = const [
          IntakeMessage(
            role: 'assistant',
            content: "What's been weighing on your mind lately?",
            timestamp: null,
          ),
        ],
        selectedCarePlan = null,
        isCompleting = false,
        isComplete = false;

  IntakeState copyWith({
    int? step,
    List<IntakeMessage>? messages,
    String? selectedCarePlan,
    bool? isCompleting,
    bool? isComplete,
  }) {
    return IntakeState(
      step: step ?? this.step,
      messages: messages ?? this.messages,
      selectedCarePlan: selectedCarePlan ?? this.selectedCarePlan,
      isCompleting: isCompleting ?? this.isCompleting,
      isComplete: isComplete ?? this.isComplete,
    );
  }
}

final intakeProvider =
    NotifierProvider<IntakeNotifier, IntakeState>(IntakeNotifier.new);

class IntakeNotifier extends Notifier<IntakeState> {
  @override
  IntakeState build() {
    return IntakeState.initial();
  }

  void startStep2(String userResponse) {
    state = state.copyWith(
      step: 2,
      messages: [
        ...state.messages,
        IntakeMessage(
          role: 'user',
          content: userResponse,
          timestamp: DateTime.now(),
        ),
        IntakeMessage(
          role: 'assistant',
          content:
              'Thanks for sharing. Which type of support feels like the best fit right now?',
          timestamp: DateTime.now(),
        ),
      ],
    );
  }

  void selectCarePlan(String plan) {
    state = state.copyWith(
      step: 3,
      selectedCarePlan: plan,
      messages: [
        ...state.messages,
        IntakeMessage(
          role: 'user',
          content: plan,
          timestamp: DateTime.now(),
        ),
        IntakeMessage(
          role: 'assistant',
          content: "Thanks. I'll tailor your experience around $plan.",
          timestamp: DateTime.now(),
        ),
      ],
    );
  }

  void complete() {
    state = state.copyWith(isComplete: true);
  }

  void goBack() {
    if (state.step == 2) {
      final messages = state.messages.take(state.messages.length - 2).toList();
      state = state.copyWith(step: 1, messages: messages);
    } else if (state.step == 3) {
      final messages = state.messages.take(state.messages.length - 2).toList();
      state = state.copyWith(
        step: 2,
        isCompleting: false,
        messages: messages,
      );
    }
  }
}
