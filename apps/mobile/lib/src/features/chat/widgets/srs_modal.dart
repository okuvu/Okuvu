import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/providers.dart';

void showSrsModal(BuildContext context) {
  showModalBottomSheet<void>(
    context: context,
    isDismissible: true,
    enableDrag: true,
    showDragHandle: true,
    builder: (_) => const _SrsModalContent(),
  );
}

class _SrsModalContent extends ConsumerStatefulWidget {
  const _SrsModalContent();

  @override
  ConsumerState<_SrsModalContent> createState() => _SrsModalContentState();
}

class _SrsModalContentState extends ConsumerState<_SrsModalContent> {
  double _experience = 5;
  double _clarity = 5;
  double _support = 5;

  void _submit() {
    final avg = ((_experience + _clarity + _support) / 3).round();
    ref.read(chatMessagesProvider.notifier).setSessionFeedback(avg);

    // Fire-and-forget PATCH to backend
    final sessionId = ref.read(sessionIdProvider);
    final dio = ref.read(dioClientProvider);
    if (sessionId != null) {
  unawaited(() async {
    try {
      await dio.patch(
        '/sessions/$sessionId/srs',
        data: {'score': avg},
      );
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[SRS] PATCH failed: $e');
      }
    }
  }());
} else if (kDebugMode) {
  debugPrint('[SRS] No session ID available, skipping PATCH');
}

    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 8,
        bottom: MediaQuery.of(context).padding.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Text(
              'Session Feedback',
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(height: 24),
          _SliderRow(
            label: 'Overall experience',
            value: _experience,
            onChanged: (v) => setState(() => _experience = v),
          ),
          const SizedBox(height: 16),
          _SliderRow(
            label: 'Clarity / helpfulness',
            value: _clarity,
            onChanged: (v) => setState(() => _clarity = v),
          ),
          const SizedBox(height: 16),
          _SliderRow(
            label: 'Emotional support',
            value: _support,
            onChanged: (v) => setState(() => _support = v),
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Skip'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: _submit,
                  child: const Text('Submit'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SliderRow extends StatelessWidget {
  final String label;
  final double value;
  final ValueChanged<double> onChanged;

  const _SliderRow({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: theme.textTheme.bodyMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        Row(
          children: [
            Text(
              '${value.toInt()}',
              style: theme.textTheme.labelLarge?.copyWith(
                fontWeight: FontWeight.w600,
                color: theme.colorScheme.primary,
              ),
            ),
            Expanded(
              child: Slider(
                value: value,
                min: 0,
                max: 10,
                divisions: 10,
                label: '${value.toInt()}',
                onChanged: onChanged,
              ),
            ),
          ],
        ),
      ],
    );
  }
}
