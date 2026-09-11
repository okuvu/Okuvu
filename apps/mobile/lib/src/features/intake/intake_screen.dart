import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../config/app_config.dart';
import '../../config/environment.dart';
import '../../core/providers.dart';
import '../chat/models/chat_message.dart';
import '../chat/widgets/typing_indicator.dart';
import '../chat/widgets/reconnect_banner.dart';
import 'intake_notifier.dart';
import 'widgets/onboarding_progress_bar.dart';

class IntakeScreen extends ConsumerStatefulWidget {
  const IntakeScreen({super.key});

  @override
  ConsumerState<IntakeScreen> createState() => _IntakeScreenState();
}

class _IntakeScreenState extends ConsumerState<IntakeScreen> {
  final _textController = TextEditingController();
  final _scrollController = ScrollController();
  bool _textIsEmpty = true;
  bool _navigated = false;
  bool _initialized = false;

  @override
  void initState() {
    super.initState();
    _textController.addListener(_onTextChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _initializeConnection();
    });
  }

  @override
  void dispose() {
    _textController.removeListener(_onTextChanged);
    _textController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _onTextChanged() {
    final isEmpty = _textController.text.trim().isEmpty;
    if (isEmpty != _textIsEmpty) {
      setState(() => _textIsEmpty = isEmpty);
    }
  }

  Future<void> _initializeConnection() async {
    if (_initialized) return;
    _initialized = true;

    final authService = ref.read(authServiceProvider);
    final token = await authService.getIdToken() ?? '';
    final env = Environment.fromString(AppConfig.flavor);

    ref.read(intakeProvider.notifier).connectToWebSocket(
          wsBaseUrl: env.wsBaseUrl,
          token: token,
        );
  }

  void _onSend() {
    final text = _textController.text.trim();
    if (text.isEmpty) return;
    ref.read(intakeProvider.notifier).sendResponse(text);
    _textController.clear();
    _scrollToBottom();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final state = ref.watch(intakeProvider);

    ref.listen<IntakeState>(intakeProvider, (prev, next) {
      if (next.messages.length > (prev?.messages.length ?? 0)) {
        _scrollToBottom();
      }

      if (next.isComplete && !_navigated) {
        _navigated = true;
        ref.read(hasCompletedOnboardingProvider.notifier).complete();
        ref.read(webSocketServiceProvider).disconnect();
        if (mounted) context.go('/home');
      }
    });

    return Scaffold(
      appBar: AppBar(
        leading: state.step != IntakeStep.waitingForOpeningMessage &&
                !state.isComplete
            ? IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () => context.go('/onboarding/consent'),
              )
            : null,
        title: const Text('OKUVU'),
        centerTitle: true,
      ),
      body: SafeArea(
        child: Column(
          children: [
            const _ReconnectBannerAdapter(),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: OnboardingProgressBar(
                filledSegments: state.progressFilledSegments,
                segmentCount: 3,
              ),
            ),
            const SizedBox(height: 8),
            Expanded(child: _buildBody(theme, state)),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(ThemeData theme, IntakeState state) {
    final waitingForOpening =
        state.step == IntakeStep.waitingForOpeningMessage;

    if (waitingForOpening && state.messages.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    return Column(
      children: [
        Expanded(child: _buildMessagesList(state)),
        if (state.isWaitingForReply)
          const Padding(
            padding: EdgeInsets.only(bottom: 8),
            child: TypingIndicator(),
          ),
        if (state.isInputEnabled) _buildInputBar(theme),
      ],
    );
  }

  Widget _buildMessagesList(IntakeState state) {
    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      itemCount: state.messages.length,
      itemBuilder: (context, index) {
        return _IntakeBubble(message: state.messages[index]);
      },
    );
  }

  Widget _buildInputBar(ThemeData theme) {
    return Container(
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
              key: const ValueKey('intake_input'),
              controller: _textController,
              textCapitalization: TextCapitalization.sentences,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _onSend(),
              decoration: const InputDecoration(
                hintText: 'Type a message...',
                border: InputBorder.none,
                contentPadding:
                    EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              ),
            ),
          ),
          IconButton(
            key: const ValueKey('intake_send'),
            onPressed: _textIsEmpty ? null : _onSend,
            icon: const Icon(Icons.send_rounded),
            style: IconButton.styleFrom(
              backgroundColor: _textIsEmpty
                  ? theme.colorScheme.surfaceContainerHighest
                  : theme.colorScheme.primary,
              foregroundColor: _textIsEmpty
                  ? theme.colorScheme.onSurfaceVariant
                  : theme.colorScheme.onPrimary,
            ),
          ),
        ],
      ),
    );
  }
}

class _ReconnectBannerAdapter extends ConsumerWidget {
  const _ReconnectBannerAdapter();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final show = ref.watch(wsShowBannerProvider);
    if (!show) return const SizedBox.shrink();
    return const ReconnectBanner();
  }
}

class _IntakeBubble extends StatelessWidget {
  final ChatMessage message;

  const _IntakeBubble({required this.message});

  @override
  Widget build(BuildContext context) {
    final isUser = message.sender == MessageSender.user;
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment:
            isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!isUser)
            const Padding(
              padding: EdgeInsets.only(right: 8),
              child: CircleAvatar(
                radius: 14,
                backgroundColor: Color(0xFF1A6B5A),
                child: Text(
                  'E',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          Flexible(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: isUser ? theme.colorScheme.primary : Colors.white,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(20),
                  topRight: const Radius.circular(20),
                  bottomLeft:
                      isUser ? const Radius.circular(20) : Radius.zero,
                  bottomRight:
                      isUser ? Radius.zero : const Radius.circular(20),
                ),
                boxShadow: isUser
                    ? null
                    : [
                        BoxShadow(
                          color: Colors.black.withAlpha(13),
                          blurRadius: 4,
                          offset: const Offset(0, 2),
                        ),
                      ],
              ),
              child: Text(
                message.content,
                style: TextStyle(
                  color: isUser
                      ? theme.colorScheme.onPrimary
                      : theme.colorScheme.onSurface,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
