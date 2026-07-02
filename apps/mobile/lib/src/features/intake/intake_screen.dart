import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../chat/widgets/reconnect_banner.dart';
import 'intake_message.dart';
import 'intake_notifier.dart';

class IntakeScreen extends ConsumerStatefulWidget {
  const IntakeScreen({super.key});

  @override
  ConsumerState<IntakeScreen> createState() => _IntakeScreenState();
}

class _IntakeScreenState extends ConsumerState<IntakeScreen> {
  final TextEditingController _textController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  bool _textIsEmpty = true;
  IntakeNotifier? _intakeNotifier;

  @override
  void initState() {
    super.initState();
    _intakeNotifier = ref.read(intakeProvider.notifier);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _intakeNotifier!.init();
    });
    _textController.addListener(_onTextChanged);
  }

  @override
  void dispose() {
    _intakeNotifier?.cleanup();
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

  void _onSend() {
    final text = _textController.text;
    if (text.trim().isEmpty) return;
    _intakeNotifier?.sendMessage(text);
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

      if (next.isComplete && !next.isSending && !next.hasNavigated) {
        _intakeNotifier?.cleanup();
        if (mounted) context.go('/home');
      }
    });

    return Scaffold(
      appBar: AppBar(
        title: const Text('Evia'),
        automaticallyImplyLeading: false,
      ),
      body: SafeArea(
        child: Stack(
          children: [
            Column(
              children: [
                Expanded(
                  child: ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 8,
                    ),
                    itemCount: state.messages.length,
                    itemBuilder: (context, index) {
                      final message = state.messages[index];
                      return _MessageBubble(
                        message: message,
                        theme: theme,
                      );
                    },
                  ),
                ),
                _BottomBar(
                  controller: _textController,
                  textIsEmpty: _textIsEmpty,
                  isSending: state.isSending,
                  isComplete: state.isComplete,
                  turnCount: state.turnCount,
                  error: state.error,
                  onSend: _onSend,
                  theme: theme,
                ),
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
}

class _MessageBubble extends StatelessWidget {
  final IntakeMessage message;
  final ThemeData theme;

  const _MessageBubble({
    required this.message,
    required this.theme,
  });

  @override
  Widget build(BuildContext context) {
    final isUser = message.role == 'user';

    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.75,
        ),
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: isUser
              ? theme.colorScheme.primary
              : theme.colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(12),
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
    );
  }
}

class _BottomBar extends StatelessWidget {
  final TextEditingController controller;
  final bool textIsEmpty;
  final bool isSending;
  final bool isComplete;
  final int turnCount;
  final String? error;
  final VoidCallback onSend;
  final ThemeData theme;

  const _BottomBar({
    required this.controller,
    required this.textIsEmpty,
    required this.isSending,
    required this.isComplete,
    required this.turnCount,
    this.error,
    required this.onSend,
    required this.theme,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (error != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Text(
              error!,
              style: TextStyle(
                color: theme.colorScheme.error,
                fontSize: 12,
              ),
            ),
          ),
        const Divider(height: 1),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 4, 4, 8),
          child: Row(
            children: [
              Text(
                'Step $turnCount / 3',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: controller,
                  textCapitalization: TextCapitalization.sentences,
                  textInputAction: TextInputAction.send,
                  onSubmitted: isComplete || isSending ? null : (_) => onSend(),
                  decoration: const InputDecoration(
                    hintText: 'Type a message...',
                    border: InputBorder.none,
                    contentPadding: EdgeInsets.symmetric(horizontal: 8),
                  ),
                  enabled: !isComplete,
                ),
              ),
              IconButton(
                onPressed: isComplete || isSending || textIsEmpty
                    ? null
                    : onSend,
                icon: const Icon(Icons.send_rounded),
              ),
            ],
          ),
        ),
      ],
    );
  }
}


