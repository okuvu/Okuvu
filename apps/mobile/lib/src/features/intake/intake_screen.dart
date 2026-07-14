import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'intake_message.dart';
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
  Timer? _completionTimer;
  bool _navigated = false;

  @override
  void initState() {
    super.initState();
    _textController.addListener(_onTextChanged);
  }

  @override
  void dispose() {
    _completionTimer?.cancel();
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
    final text = _textController.text.trim();
    if (text.isEmpty) return;
    ref.read(intakeProvider.notifier).startStep2(text);
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

      if (next.step == 3 && prev?.step != 3) {
        _completionTimer?.cancel();
        _completionTimer = Timer(const Duration(seconds: 1), () {
          ref.read(intakeProvider.notifier).complete();
        });
      }

      if (next.isComplete && !_navigated) {
        _navigated = true;
        _completionTimer?.cancel();
        if (mounted) context.go('/home');
      }
    });

    return Scaffold(
      appBar: AppBar(
        leading: state.step > 1
            ? IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () {
                  _completionTimer?.cancel();
                  ref.read(intakeProvider.notifier).goBack();
                },
              )
            : null,
        title: const Text('Evia'),
        centerTitle: true,
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: OnboardingProgressBar(filledSegments: state.step + 1),
            ),
            const SizedBox(height: 8),
            Expanded(child: _buildBody(theme, state)),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(ThemeData theme, IntakeState state) {
    if (state.step == 1) return _buildFrame1(theme);
    if (state.step == 2) return _buildFrame2(theme);
    return _buildFrame3();
  }

  Widget _buildFrame1(ThemeData theme) {
    return Column(
      children: [
        Expanded(child: _buildMessagesList()),
        _buildInputBar(theme),
      ],
    );
  }

  Widget _buildFrame2(ThemeData theme) {
    return Column(
      children: [
        Expanded(child: _buildMessagesList()),
        _buildCarePlanOptions(theme),
      ],
    );
  }

  Widget _buildFrame3() {
    return _buildMessagesList();
  }

  Widget _buildMessagesList() {
    final state = ref.watch(intakeProvider);
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

  Widget _buildCarePlanOptions(ThemeData theme) {
    const plans = [
      'Anxiety support',
      'Low mood support',
      'Stress and burnout support',
    ];

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
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
          ...plans.map(
            (plan) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: () =>
                      ref.read(intakeProvider.notifier).selectCarePlan(plan),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 16,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    side: BorderSide(
                      color: theme.colorScheme.outlineVariant,
                    ),
                  ),
                  child: Text(
                    plan,
                    style: theme.textTheme.bodyLarge?.copyWith(
                      color: theme.colorScheme.onSurface,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _IntakeBubble extends StatelessWidget {
  final IntakeMessage message;

  const _IntakeBubble({required this.message});

  @override
  Widget build(BuildContext context) {
    final isUser = message.role == 'user';
    final theme = Theme.of(context);
    final borderRadius = BorderRadius.only(
      topLeft: const Radius.circular(20),
      topRight: const Radius.circular(20),
      bottomLeft: isUser ? const Radius.circular(20) : Radius.zero,
      bottomRight: isUser ? Radius.zero : const Radius.circular(20),
    );

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment:
            isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          Container(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.of(context).size.width * 0.75,
            ),
            padding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: isUser
                  ? theme.colorScheme.primary
                  : Colors.white,
              borderRadius: borderRadius,
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
        ],
      ),
    );
  }
}
