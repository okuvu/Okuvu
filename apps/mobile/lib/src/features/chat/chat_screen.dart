import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../config/app_config.dart';
import '../../config/flavor_config.dart';
import '../../core/providers.dart';
import 'models/chat_message.dart';
import 'models/chat_state.dart';
import 'widgets/reconnect_banner.dart';
import 'widgets/srs_modal.dart';
import '../../widgets/voice_toggle.dart';

const bool _useMockResponses = kDebugMode;

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _scrollController = ScrollController();
  final _textController = TextEditingController();
  bool _srsTriggered = false;

  @override
  void initState() {
    super.initState();
    ref.read(webSocketServiceProvider).connect(
      wsBaseUrl: AppConfig.wsBaseUrl,
      token: FlavorConfig.devBypassToken ?? '',
    );
    if (kDebugMode) debugPrint('[ChatScreen] initState: WS connect called');
  }

  @override
  void dispose() {
    _scrollController.dispose();
    _textController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _sendMessage() {
    if (ref.read(chatMessagesProvider).isSessionClosed) return;
    final text = _textController.text.trim();
    if (text.isEmpty) return;

    if (kDebugMode) debugPrint('[ChatScreen] _sendMessage: "$text"');

    ref.read(chatMessagesProvider.notifier).addUserMessage(text);
    ref.read(webSocketServiceProvider).sendUserTurn(text);
    _textController.clear();
    _scrollToBottom();

    if (_useMockResponses) {
      Future.delayed(const Duration(milliseconds: 800), () {
        if (kDebugMode) debugPrint('[ChatScreen] Injecting mock agent response');
        ref.read(webSocketServiceProvider).injectMockAgentTurn(
          'I hear you. Tell me more about how that makes you feel.',
        );
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final chatState = ref.watch(chatMessagesProvider);
    final isOnline = ref.watch(isOnlineProvider);

    ref.listen<bool>(crisisOverlayProvider, (_, show) {
      if (show) {
        context.push('/crisis');
      }
    });

    ref.listen<ChatState>(chatMessagesProvider, (previous, next) {
      if (previous != null && !previous.isSessionClosed && next.isSessionClosed) {
        Future.delayed(const Duration(milliseconds: 400), () async {
          if (context.mounted &&
              ref.read(chatMessagesProvider).isSessionClosed &&
              !_srsTriggered) {
            _srsTriggered = true;
            await showSrsModal(context);
            if (context.mounted) context.go('/home');
          }
        });
      }
    });

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (chatState.messages.isNotEmpty) _scrollToBottom();
    });

    return Scaffold(
      appBar: AppBar(
        title: const Text('Evia'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Text(
              '${chatState.turnCount}/10 turns',
              style: TextStyle(
                fontSize: 13,
                color: chatState.turnCount >= 10
                    ? Theme.of(context).colorScheme.error
                    : Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          if (!isOnline)
            const Padding(
              padding: EdgeInsets.only(right: 12),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.cloud_off, size: 18),
                  SizedBox(width: 4),
                  Text('Offline', style: TextStyle(fontSize: 12)),
                ],
              ),
            ),
        ],
      ),
      body: Stack(
        children: [
          Column(
            children: [
              const VoiceToggle(),
              const Divider(height: 1),
              Expanded(
                child: chatState.messages.isEmpty
                    ? _buildEmptyState(context)
                    : ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        itemCount: chatState.messages.length,
                        itemBuilder: (context, index) {
                          return _ChatBubble(message: chatState.messages[index]);
                        },
                      ),
              ),
              _buildInputBar(context, chatState.isSessionClosed),
            ],
          ),
          const Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: ReconnectBanner(),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.chat_bubble_outline,
            size: 64,
            color: Theme.of(context).colorScheme.primary.withAlpha(100),
          ),
          const SizedBox(height: 16),
          Text(
            'How are you feeling today?',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
          ),
        ],
      ),
    );
  }

  Widget _buildInputBar(BuildContext context, bool sessionClosed) {
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        boxShadow: [
          BoxShadow(
            offset: const Offset(0, -1),
            blurRadius: 4,
            color: Colors.black.withAlpha(20),
          ),
        ],
      ),
      padding: EdgeInsets.only(
        left: 16,
        right: 8,
        top: 8,
        bottom: MediaQuery.of(context).padding.bottom + 8,
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _textController,
              textInputAction: TextInputAction.send,
              onSubmitted: sessionClosed ? null : (_) => _sendMessage(),
              enabled: !sessionClosed,
              decoration: InputDecoration(
                hintText: sessionClosed ? 'Session ended' : 'Type a message...',
                border: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              ),
            ),
          ),
          IconButton(
            onPressed: sessionClosed ? null : _sendMessage,
            icon: const Icon(Icons.send_rounded),
            style: IconButton.styleFrom(
              backgroundColor: sessionClosed
                  ? Theme.of(context).colorScheme.surfaceContainerHighest
                  : Theme.of(context).colorScheme.primary,
              foregroundColor: sessionClosed
                  ? Theme.of(context).colorScheme.onSurfaceVariant
                  : Theme.of(context).colorScheme.onPrimary,
            ),
          ),
        ],
      ),
    );
  }
}

class _ChatBubble extends StatelessWidget {
  final ChatMessage message;

  const _ChatBubble({required this.message});

  @override
  Widget build(BuildContext context) {
    final isUser = message.sender == MessageSender.user;
    final alignment = isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start;
    final borderRadius = BorderRadius.only(
      topLeft: const Radius.circular(20),
      topRight: const Radius.circular(20),
      bottomLeft: isUser ? const Radius.circular(20) : Radius.zero,
      bottomRight: isUser ? Radius.zero : const Radius.circular(20),
    );

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: alignment,
        children: [
          Container(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.of(context).size.width * 0.75,
            ),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: isUser
                  ? Theme.of(context).colorScheme.primary
                  : Theme.of(context).colorScheme.surfaceContainerHighest,
              borderRadius: borderRadius,
            ),
            child: Text(
              message.content,
              style: TextStyle(
                color: isUser
                    ? Theme.of(context).colorScheme.onPrimary
                    : Theme.of(context).colorScheme.onSurface,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
