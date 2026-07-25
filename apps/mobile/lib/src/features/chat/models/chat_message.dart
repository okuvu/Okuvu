import 'tool_card_config.dart';

enum MessageSender { user, agent }

class ChatMessage {
  final String id;
  final MessageSender sender;
  final String content;
  final DateTime timestamp;
  final ToolCardConfig? toolCard;

  const ChatMessage({
    required this.id,
    required this.sender,
    required this.content,
    required this.timestamp,
    this.toolCard,
  });
}
