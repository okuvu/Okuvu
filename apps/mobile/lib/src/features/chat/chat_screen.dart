import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:permission_handler/permission_handler.dart';
import '../../config/app_config.dart';
import '../../config/flavor_config.dart';
import '../../core/logger.dart';
import '../../core/providers.dart';
import '../../core/speech_service.dart';
import '../../core/websocket_service.dart';
import 'models/chat_message.dart';
import 'models/chat_state.dart';
import 'widgets/reconnect_banner.dart';
import 'widgets/srs_modal.dart';
import 'widgets/typing_indicator.dart';
import '../../widgets/voice_toggle.dart';
import 'widgets/tool_card_widget.dart';
import '../home/widgets/home_bottom_nav.dart';
import '../home/providers/today_card_provider.dart';
import '../../theme/app_colors.dart';

const bool _useMockResponses = false;
// Mirrors apps/api/src/routes/websocket.ts's MAX_MESSAGE_LENGTH — keep the
// two in sync if either changes.
const int _maxMessageLength = 4000;
// How long a turn is given to come back before we give up on it — used
// both for the "no response received" snackbar and to bound how long
// _confirmEndSession waits before tearing down the socket on a pending
// turn (see its own comment for why that matters).
const Duration _turnResponseTimeout = Duration(seconds: 20);

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

  late final SpeechService _speech;
  bool _isListening = false;
  // Text already in the field when the mic was tapped — a transcript is
  // appended to it rather than replacing what the user typed by hand.
  String _voiceBaseText = '';
  // Set when a dictation session is being torn down without wanting its
  // transcript (message sent, session closed). Without it the recognizer's
  // final result arrives after _textController.clear() and puts the words
  // the user just sent back into the empty field.
  bool _discardTranscript = false;

  @override
  void initState() {
    super.initState();
    _speech = ref.read(speechServiceProvider);
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
    _speech.dispose();
    _scrollController.dispose();
    _textController.dispose();
    super.dispose();
  }

  // Talk-instead-of-typing. Tap to start, tap again to stop; the recognizer
  // also ends the session itself after a few seconds of silence, so the
  // common case is "say it, then send". Nothing is auto-sent: a
  // mis-transcription in a mental-health conversation must be visible in the
  // field, editable, and only sent when the user chooses to.
  Future<void> _toggleListening() async {
    if (_isListening) {
      await _speech.stop();
      if (mounted) setState(() => _isListening = false);
      return;
    }

    _discardTranscript = false;
    _voiceBaseText = _textController.text.trimRight();

    final outcome = await _speech.start(
      onWords: (words, _) {
        if (!mounted || _discardTranscript) return;
        final combined = _voiceBaseText.isEmpty || words.isEmpty
            ? '$_voiceBaseText$words'
            : '$_voiceBaseText $words';
        _textController.value = TextEditingValue(
          text: combined,
          selection: TextSelection.collapsed(offset: combined.length),
        );
      },
      onEnded: () {
        if (mounted && _isListening) setState(() => _isListening = false);
      },
    );

    if (!mounted) return;

    switch (outcome) {
      case SpeechStartOutcome.listening:
        setState(() => _isListening = true);
        break;
      case SpeechStartOutcome.permissionDenied:
        _showVoiceSnack('Microphone access is needed to talk instead of type.');
        break;
      case SpeechStartOutcome.permissionBlocked:
        _showVoiceSnack(
          'Microphone access is off for Okuvu. Turn it on in Settings to talk instead of type.',
          action: SnackBarAction(
            label: 'Settings',
            onPressed: () => openAppSettings(),
          ),
        );
        break;
      case SpeechStartOutcome.unavailable:
        _showVoiceSnack("Voice input isn't available on this device.");
        break;
      case SpeechStartOutcome.error:
        _showVoiceSnack("Couldn't start voice input. Please try again.");
        break;
    }
  }

  /// Ends dictation without letting the final transcript land anywhere.
  void _stopVoiceInput({bool discard = true}) {
    if (!_isListening && !discard) return;
    _discardTranscript = discard;
    _speech.cancel();
    if (mounted && _isListening) setState(() => _isListening = false);
  }

  void _showVoiceSnack(String message, {SnackBarAction? action}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), action: action),
    );
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
    _typingTimer = Timer(_turnResponseTimeout, () {
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
      // Safety-critical: if a turn is still awaiting a response (e.g. the
      // backend is still classifying the user's last message), the reply
      // could be CRISIS_SIGNAL. disconnect() sends SESSION_CLOSE then tears
      // down the socket in the same call with no gap — closing the socket
      // before that classification lands means the app would never receive
      // it, with no fallback: the backend computes a crisis_bypass flag on
      // the next SESSION_OPEN, but the client never reads it. Navigate away
      // immediately (the app-wide crisis overlay works from any screen), but
      // hold the actual disconnect open long enough for a pending response.
      // The service instance is captured now, not read from `ref` inside
      // the delayed callback — this State will be disposed by then.
      final ws = ref.read(webSocketServiceProvider);
      if (_isAgentTyping) {
        Future.delayed(_turnResponseTimeout, ws.disconnect);
      } else {
        ws.disconnect();
      }
      if (context.mounted) context.go('/home');
    }
  }

  void _sendMessage() {
    if (ref.read(chatMessagesProvider).isSessionClosed) return;
    if (ref.read(todayCardProvider).asData?.value.careEnded ?? false) return;
    final text = _textController.text.trim();
    if (text.isEmpty) return;

    // Sending ends dictation: the spoken words are already in the field, and
    // a late final transcript must not reappear in the box just cleared.
    if (_isListening) _stopVoiceInput();

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
    // Decisions doc round, 15 Sep 2026 §11 — "chat goes read-only" once
    // care has ended. app.dart's app-wide overlay already covers normal
    // navigation into this state; this is defense-in-depth for a chat
    // screen that was already open when the relationship ended.
    final careEnded = ref.watch(todayCardProvider).asData?.value.careEnded ?? false;

    // The crisis overlay renders app-wide via app.dart's Stack-based
    // _CrisisOverlaySlot (watching crisisOverlayProvider directly) whenever
    // it's shown — no navigation is needed or wanted here. A prior
    // ref.listen that pushed to '/crisis' was dead code: that route was
    // never registered in router.dart, so it would have thrown a
    // NotFoundScreen had crisisOverlayProvider ever flipped true while this
    // screen was mounted.

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
          // The input bar (mic included) is replaced by the read-only footer
          // the moment this lands — stop the microphone rather than leave it
          // recording behind a screen with no way to see or stop it.
          _stopVoiceInput();
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
            icon: const Icon(LucideIcons.arrowLeft),
            onPressed: isCrisisActive
                ? null
                : chatState.isSessionClosed
                    ? () => context.go('/home')
                    : () => _confirmEndSession(context),
          ),
          title: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Image.asset('assets/brand/okuvu-mark-dark.png', width: 22, height: 22),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('OKUVU',
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.bold, color: AppColors.lavenderTint)),
                  // AppBar background is dark (royal-purple) — this used to
                  // read onSurfaceVariant, a light-surface color that was
                  // near-invisible here.
                  Text('Your session',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: AppColors.lavenderTint.withValues(alpha: 0.75))),
                ],
              ),
            ],
          ),
          actions: [
            if (!isOnline)
              const Padding(
                padding: EdgeInsets.only(left: 8),
                child: Icon(LucideIcons.cloudOff, size: 18),
              ),
          ],
        ),
        bottomNavigationBar: const HomeBottomNav(currentIndex: 1),
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
                _buildInputBar(context, chatState.isSessionClosed, careEnded,
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
            LucideIcons.messageCircle,
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

  Widget _buildInputBar(BuildContext context, bool sessionClosed,
      bool careEnded, WsConnectionState wsState) {
    final isInputDisabled = sessionClosed ||
        careEnded ||
        _isAgentTyping ||
        wsState != WsConnectionState.sessionActive;

    if (sessionClosed || careEnded) {
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
              careEnded
                  ? 'This chat is read-only now that care has ended.'
                  : 'This session has ended.',
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
              maxLength: _maxMessageLength,
              maxLengthEnforcement: MaxLengthEnforcement.enforced,
              minLines: 1,
              maxLines: 5,
              decoration: InputDecoration(
                hintText: _isListening
                    ? 'Listening… tap the mic to stop'
                    : 'Type a message...',
                border: InputBorder.none,
                counterText: '',
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              ),
            ),
          ),
          IconButton(
            key: const ValueKey('chat_mic'),
            tooltip: _isListening ? 'Stop listening' : 'Talk instead of typing',
            onPressed: isInputDisabled ? null : _toggleListening,
            icon: const Icon(LucideIcons.mic),
            style: IconButton.styleFrom(
              backgroundColor: _isListening
                  ? Theme.of(context).colorScheme.primary
                  : null,
              foregroundColor: _isListening
                  ? Theme.of(context).colorScheme.onPrimary
                  : Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          ValueListenableBuilder<TextEditingValue>(
            valueListenable: _textController,
            builder: (context, value, _) {
              final sendDisabled = isInputDisabled || value.text.trim().isEmpty;
              return IconButton(
                key: const ValueKey('chat_send'),
                onPressed: sendDisabled ? null : _sendMessage,
                icon: const Icon(LucideIcons.send),
                style: IconButton.styleFrom(
                  backgroundColor: sendDisabled
                      ? Theme.of(context).colorScheme.surfaceContainerHighest
                      : Theme.of(context).colorScheme.primary,
                  foregroundColor: sendDisabled
                      ? Theme.of(context).colorScheme.onSurfaceVariant
                      : Theme.of(context).colorScheme.onPrimary,
                ),
              );
            },
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

class _ChatBubble extends ConsumerWidget {
  final ChatMessage message;

  const _ChatBubble({required this.message});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
          if (!isUser && message.journalPromptSuggested != null)
            Padding(
              padding: const EdgeInsets.only(top: 4, left: 40),
              child: OutlinedButton.icon(
                onPressed: () {
                  ref
                      .read(journalEntryFormProvider.notifier)
                      .setContent(message.journalPromptSuggested!);
                  context.go('/journal');
                },
                icon: const Icon(LucideIcons.pencil, size: 18),
                label: const Text('Save to journal'),
              ),
            ),
        ],
      ),
    );
  }
}
