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
    backgroundColor: Colors.white,
    barrierColor: const Color(0x661A1A1A),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (_) => const _SrsModalContent(),
  );
}

class _SrsModalContent extends ConsumerStatefulWidget {
  const _SrsModalContent();

  @override
  ConsumerState<_SrsModalContent> createState() => _SrsModalContentState();
}

class _SrsModalContentState extends ConsumerState<_SrsModalContent> {
  int? _selectedIndex;
  bool _showConfirmation = false;

  static const _scores = [1, 2, 3, 4];

  void _onOptionTap(int index) {
    if (_selectedIndex != null) return;
    setState(() => _selectedIndex = index);
    _submitScore(_scores[index]);

    Future.delayed(const Duration(milliseconds: 400), () {
      if (mounted) {
        setState(() => _showConfirmation = true);
        Future.delayed(const Duration(milliseconds: 800), () {
          if (mounted) Navigator.of(context).pop();
        });
      }
    });
  }

  void _submitScore(int score) {
    ref.read(chatMessagesProvider.notifier).setSessionFeedback(score);

    final sessionId = ref.read(sessionIdProvider);
    final dio = ref.read(dioClientProvider);
    if (sessionId != null) {
      unawaited(() async {
        try {
          await dio.patch(
            '/sessions/$sessionId/srs',
            data: {'score': score},
          );
        } catch (e) {
          if (kDebugMode) debugPrint('[SRS] PATCH failed: $e');
        }
      }());
    } else if (kDebugMode) {
      debugPrint('[SRS] No session ID available, skipping PATCH');
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final bottomPadding = MediaQuery.of(context).padding.bottom;

    if (_showConfirmation) {
      return Padding(
        padding: EdgeInsets.only(
          left: 24,
          right: 24,
          top: 32,
          bottom: bottomPadding + 24,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 40),
            Icon(Icons.check_circle, size: 48, color: colorScheme.primary),
            const SizedBox(height: 12),
            Text(
              'Got it',
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.bold,
                color: colorScheme.primary,
              ),
            ),
            const SizedBox(height: 40),
          ],
        ),
      );
    }

    return Padding(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 8,
        bottom: bottomPadding + 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'How was this session?',
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Optional \u2014 takes 2 seconds.',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(
                child: _SrsRatingOption(
                  label: 'Missed the mark',
                  icon: Icons.sentiment_very_dissatisfied,
                  isSelected: _selectedIndex == 0,
                  isDimmed: _selectedIndex != null && _selectedIndex != 0,
                  onTap: () => _onOptionTap(0),
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: _SrsRatingOption(
                  label: 'Not really',
                  icon: Icons.sentiment_dissatisfied,
                  isSelected: _selectedIndex == 1,
                  isDimmed: _selectedIndex != null && _selectedIndex != 1,
                  onTap: () => _onOptionTap(1),
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: _SrsRatingOption(
                  label: 'Okay',
                  icon: Icons.sentiment_neutral,
                  isSelected: _selectedIndex == 2,
                  isDimmed: _selectedIndex != null && _selectedIndex != 2,
                  onTap: () => _onOptionTap(2),
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: _SrsRatingOption(
                  label: 'Helpful',
                  icon: Icons.sentiment_satisfied,
                  isSelected: _selectedIndex == 3,
                  isDimmed: _selectedIndex != null && _selectedIndex != 3,
                  onTap: () => _onOptionTap(3),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text(
                  'Skip',
                  style: TextStyle(color: colorScheme.onSurfaceVariant),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SrsRatingOption extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool isSelected;
  final bool isDimmed;
  final VoidCallback onTap;

  const _SrsRatingOption({
    required this.label,
    required this.icon,
    required this.isSelected,
    required this.isDimmed,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeInOut,
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
        decoration: BoxDecoration(
          border: Border.all(
            color: isSelected ? colorScheme.primary : Colors.transparent,
            width: 2,
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: AnimatedOpacity(
          duration: const Duration(milliseconds: 200),
          opacity: isDimmed ? 0.5 : 1.0,
          child: Transform.scale(
            scale: isSelected ? 1.12 : 1.0,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 28, color: colorScheme.primary),
                const SizedBox(height: 4),
                Text(
                  label,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontWeight:
                        isSelected ? FontWeight.bold : FontWeight.normal,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
