import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../config/app_config.dart';
import '../../config/flavor_config.dart';
import '../../core/logger.dart';
import '../../core/providers.dart';
import '../../core/websocket_service.dart';
import 'models/chat_message.dart';
import 'models/chat_state.dart';
import 'widgets/reconnect_banner.dart';
import 'widgets/srs_modal.dart';
import 'widgets/typing_indicator.dart';
import '../../widgets/voice_toggle.dart';
import 'widgets/tool_card_widget.dart';

const bool _useMockResponses = false;

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _scrollController = ScrollController();
  final _textController = TextEditingController();
  bool _srsTriggered = false;
  bool _isAgentTyping = false;
  Timer? _typingTimer;

  @override
  void initState() {
    super.initState();
    _connectWebSocket();
  }

  Future<void> _connectWebSocket() async {
    final token = FlavorConfig.devBypassToken
        ?? await ref.read(authServiceProvider).getIdToken()
        ?? '';
    await ref.read(webSocketServiceProvider).connect(
          wsBaseUrl: AppConfig.wsBaseUrl,
          token: token,
        );
    Logger.debug('[ChatScreen] initState: WS connect called');
  }

  @override
  void dispose() {
    _typingTimer?.cancel();
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

  void _startTypingTimeout() {
    _typingTimer?.cancel();
    _typingTimer = Timer(const Duration(seconds: 20), () {
      if (mounted) {
        setState(() => _isAgentTyping = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('No response received. Please try again.'),
          ),
        );
      }
    });
  }

  Future<void> _confirmEndSession(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('End this session?'),
        content: const Text('Your conversation will be saved.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Continue')),
          TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('End session')),
        ],
      ),
    );
    if (confirmed == true) {
      ref.read(webSocketServiceProvider).disconnect();
      if (context.mounted) context.go('/home');
    }
  }

  void _sendMessage() {
    if (ref.read(chatMessagesProvider).isSessionClosed) return;
    final text = _textController.text.trim();
    if (text.isEmpty) return;

    Logger.debug('[ChatScreen] _sendMessage: "${text.length > 100 ? '${text.substring(0, 100)}...' : text}"');

    final wsState = ref.read(wsConnectionStateProvider);
    if (wsState != WsConnectionState.sessionActive) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Not connected. Please wait...')),
        );
      }
      return;
    }

    ref.read(chatMessagesProvider.notifier).addUserMessage(text);
    ref.read(webSocketServiceProvider).sendUserTurn(text);
    _textController.clear();
    setState(() => _isAgentTyping = true);
    _startTypingTimeout();
    _scrollToBottom();

    if (_useMockResponses) {
      Future.delayed(const Duration(milliseconds: 800), () {
        Logger.debug('[ChatScreen] Injecting mock agent response');
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
    final isCrisisActive = ref.watch(crisisOverlayProvider);

    ref.listen<bool>(crisisOverlayProvider, (_, show) {
      if (show) {
        context.push('/crisis');
      }
    });

    ref.listen<ChatState>(chatMessagesProvider, (previous, next) {
      if (previous != null &&
          !previous.isSessionClosed &&
          next.isSessionClosed) {
        if (ref.read(crisisOverlayProvider)) {
          return;
        }
        if (ref.read(wsConnectionStateProvider) ==
            WsConnectionState.reconnecting) {
          return;
        }
        if (mounted) {
          _typingTimer?.cancel();
          setState(() => _isAgentTyping = false);
        }
        Future.delayed(const Duration(milliseconds: 400), () async {
          if (context.mounted &&
              ref.read(chatMessagesProvider).isSessionClosed &&
              !_srsTriggered) {
            _srsTriggered = true;
            await showSrsModal(context);
          }
        });
      }
      if (_isAgentTyping &&
          previous != null &&
          next.messages.length > previous.messages.length &&
          next.messages.last.sender == MessageSender.agent) {
        _typingTimer?.cancel();
        setState(() => _isAgentTyping = false);
      }
    });

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (chatState.messages.isNotEmpty) _scrollToBottom();
    });

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && !isCrisisActive) {
          if (chatState.isSessionClosed) {
            context.go('/home');
          } else {
            _confirmEndSession(context);
          }
        }
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: isCrisisActive
                ? null
                : chatState.isSessionClosed
                    ? () => context.go('/home')
                    : () => _confirmEndSession(context),
          ),
          title: Column(
            children: [
              Text('OKUVU',
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.bold)),
              Text('Your session',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant)),
            ],
          ),
          actions: [
            if (!isOnline)
              const Padding(
                padding: EdgeInsets.only(left: 8),
                child: Icon(Icons.cloud_off, size: 18),
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
                  child: chatState.messages.isEmpty && !_isAgentTyping
                      ? _buildEmptyState(context)
                      : ListView.builder(
                          controller: _scrollController,
                          padding: const EdgeInsets.symmetric(
                              horizontal: 16, vertical: 8),
                          itemCount: chatState.messages.length +
                              (_isAgentTyping ? 1 : 0),
                          itemBuilder: (context, index) {
                            if (_isAgentTyping &&
                                index == chatState.messages.length) {
                              return const TypingIndicator();
                            }
                            return _ChatBubble(
                                message: chatState.messages[index]);
                          },
                        ),
                ),
                _buildInputBar(context, chatState.isSessionClosed,
                    ref.watch(wsConnectionStateProvider)),
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

  Widget _buildInputBar(
      BuildContext context, bool sessionClosed, WsConnectionState wsState) {
    final isInputDisabled = sessionClosed ||
        _isAgentTyping ||
        wsState != WsConnectionState.sessionActive;

    if (sessionClosed) {
      final theme = Theme.of(context);
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          boxShadow: [
            BoxShadow(
              offset: const Offset(0, -1),
              blurRadius: 4,
              color: Colors.black.withAlpha(20),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'This session has ended.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                key: const ValueKey('back_to_home'),
                onPressed: _onBackToHome,
                child: const Text('Back to Home'),
              ),
            ),
          ],
        ),
      );
    }

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
              key: const ValueKey('chat_input'),
              controller: _textController,
              textInputAction: TextInputAction.send,
              onSubmitted: isInputDisabled ? null : (_) => _sendMessage(),
              enabled: !isInputDisabled,
              decoration: const InputDecoration(
                hintText: 'Type a message...',
                border: InputBorder.none,
                contentPadding:
                    EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              ),
            ),
          ),
          IconButton(
            key: const ValueKey('chat_send'),
            onPressed: isInputDisabled ? null : _sendMessage,
            icon: const Icon(Icons.send_rounded),
            style: IconButton.styleFrom(
              backgroundColor: isInputDisabled
                  ? Theme.of(context).colorScheme.surfaceContainerHighest
                  : Theme.of(context).colorScheme.primary,
              foregroundColor: isInputDisabled
                  ? Theme.of(context).colorScheme.onSurfaceVariant
                  : Theme.of(context).colorScheme.onPrimary,
            ),
          ),
        ],
      ),
    );
  }

  void _onBackToHome() {
    if (!_srsTriggered) {
      _srsTriggered = true;
      showSrsModal(context).then((_) {
        if (mounted) context.go('/home');
      });
    } else {
      if (mounted) context.go('/home');
    }
  }
}

class _ChatBubble extends StatelessWidget {
  final ChatMessage message;

  const _ChatBubble({required this.message});

  @override
  Widget build(BuildContext context) {
    final isUser = message.sender == MessageSender.user;
    final theme = Theme.of(context);
    final borderRadius = BorderRadius.only(
      topLeft: const Radius.circular(20),
      topRight: const Radius.circular(20),
      bottomLeft: isUser ? const Radius.circular(20) : Radius.zero,
      bottomRight: isUser ? Radius.zero : const Radius.circular(20),
    );

    return Padding(
      padding: EdgeInsets.only(
          top: 4, bottom: 4, left: isUser ? 64 : 0, right: isUser ? 0 : 64),
      child: Column(
        crossAxisAlignment:
            isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          if (!isUser)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircleAvatar(
                    radius: 16,
                    backgroundColor: theme.colorScheme.primary,
                    child: Text(
                      'E',
                      style: TextStyle(
                        color: theme.colorScheme.onPrimary,
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Container(
                      constraints: BoxConstraints(
                        maxWidth: MediaQuery.of(context).size.width * 0.75,
                      ),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 12),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: borderRadius,
                        boxShadow: [
                          BoxShadow(
                            offset: const Offset(0, 1),
                            blurRadius: 2,
                            color: Colors.black.withAlpha(13),
                          ),
                        ],
                      ),
                      child: Text(
                        message.content,
                        style: TextStyle(color: theme.colorScheme.onSurface),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          if (isUser)
            Container(
              constraints: BoxConstraints(
                maxWidth: MediaQuery.of(context).size.width * 0.75,
              ),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: theme.colorScheme.primary,
                borderRadius: borderRadius,
              ),
              child: Text(
                message.content,
                style: TextStyle(color: theme.colorScheme.onPrimary),
              ),
            ),
          if (!isUser && message.toolCard != null)
            Padding(
              padding: const EdgeInsets.only(top: 4, left: 40),
              child: ToolCardWidget(config: message.toolCard!),
            ),
        ],
      ),
    );
  }
}
