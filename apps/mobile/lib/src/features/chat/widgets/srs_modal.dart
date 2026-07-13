import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/providers.dart';

Future<void> showSrsModal(BuildContext context) {
  return showModalBottomSheet<void>(
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
  int? _srsScore;

  void _submit() {
    if (_srsScore == null) return;

    ref.read(chatMessagesProvider.notifier).setSessionFeedback(_srsScore!);

    final sessionId = ref.read(sessionIdProvider);
    final dio = ref.read(dioClientProvider);
    if (sessionId != null) {
      unawaited(() async {
        try {
          await dio.patch(
            '/sessions/$sessionId/srs',
            data: {'srs_score': _srsScore},
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
          _SrsOptionRow(
            selectedValue: _srsScore,
            onChanged: (v) => setState(() => _srsScore = v),
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
                  onPressed: _srsScore != null ? _submit : null,
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

class _SrsOptionRow extends StatelessWidget {
  final int? selectedValue;
  final ValueChanged<int> onChanged;

  const _SrsOptionRow({
    required this.selectedValue,
    required this.onChanged,
  });

  static const _options = [
    (value: 1, label: 'Missed the mark'),
    (value: 2, label: 'Not really'),
    (value: 3, label: 'Okay'),
    (value: 4, label: 'Helpful'),
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      children: _options.map((opt) {
        final isSelected = selectedValue == opt.value;
        return Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Material(
              color: isSelected
                  ? theme.colorScheme.primaryContainer
                  : theme.colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(12),
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () => onChanged(opt.value),
                child: SizedBox(
                  height: 88,
                  child: Padding(
                    padding:
                        const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          '${opt.value}',
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                            color: isSelected
                                ? theme.colorScheme.onPrimaryContainer
                                : theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          opt.label,
                          textAlign: TextAlign.center,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: isSelected
                                ? theme.colorScheme.onPrimaryContainer
                                : theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}
