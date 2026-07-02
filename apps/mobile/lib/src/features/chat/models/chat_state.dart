import 'chat_message.dart';

class ChatState {
  final List<ChatMessage> messages;
  final int turnCount;
  final bool isSessionClosed;
  final int? sessionFeedback;

  const ChatState({
    required this.messages,
    this.turnCount = 0,
    this.isSessionClosed = false,
    this.sessionFeedback,
  });

  ChatState copyWith({
    List<ChatMessage>? messages,
    int? turnCount,
    bool? isSessionClosed,
    int? Function()? sessionFeedback,
  }) {
    return ChatState(
      messages: messages ?? this.messages,
      turnCount: turnCount ?? this.turnCount,
      isSessionClosed: isSessionClosed ?? this.isSessionClosed,
      sessionFeedback: sessionFeedback != null ? sessionFeedback() : this.sessionFeedback,
    );
  }
}
