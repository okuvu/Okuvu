import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/providers.dart';

const _handleHeight = 4.0;
const _handleWidth = 32.0;
const _animationDuration = Duration(milliseconds: 200);
const _confirmationDelay = Duration.zero;
const _confirmationDuration = Duration(milliseconds: 800);

Future<void> showSrsModal(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isDismissible: true,
    enableDrag: true,
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
  bool _analyticsShown = false;

  static const _scores = [1, 2, 3, 4];
  static const _labels = [
    'Missed the mark',
    'Not really',
    'Okay',
    'Helpful',
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_analyticsShown && mounted) {
        _analyticsShown = true;
        ref.read(analyticsServiceProvider).logEvent('srs_modal_shown');
      }
    });
  }

  void _onOptionTap(int index) {
    if (_selectedIndex != null) return;
    setState(() => _selectedIndex = index);
    _submitScore(_scores[index]);

    ref.read(analyticsServiceProvider).logEvent(
      'srs_rating_selected',
      properties: {'score': _scores[index], 'label': _labels[index]},
    );

    Future.delayed(_confirmationDelay, () {
      if (mounted) {
        setState(() => _showConfirmation = true);
        Future.delayed(_confirmationDuration, () {
          if (mounted) {
            ref.read(analyticsServiceProvider).logEvent('srs_dismissed');
            Navigator.of(context).pop();
          }
        });
      }
    });
  }

  void _submitScore(int score) {
    ref.read(chatMessagesProvider.notifier).setSessionFeedback(score);

    final sessionId = ref.read(sessionIdProvider);
    final dio = ref.read(dioClientProvider);
    if (sessionId != null) {
      try {
        unawaited(dio.patch(
          '/sessions/$sessionId/srs',
          data: {'srs_score': score},
        ));
      } catch (e) {
        if (kDebugMode) debugPrint('[SRS] PATCH failed: $e');
      }
    } else if (kDebugMode) {
      debugPrint('[SRS] No session ID available, skipping PATCH');
    }
  }

  void _skip() {
    ref.read(analyticsServiceProvider).logEvent('srs_skipped');
    Navigator.of(context).pop();
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
          top: 8,
          bottom: bottomPadding + 24,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const _SrsHandle(),
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
          const _SrsHandle(),
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
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
                  ],
                ),
              ),
              TextButton(
                onPressed: _skip,
                style: TextButton.styleFrom(
                  foregroundColor: colorScheme.onSurfaceVariant,
                  padding: EdgeInsets.zero,
                  minimumSize: const Size(48, 32),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: Text(
                  'Skip',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            ],
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
        ],
      ),
    );
  }
}

class _SrsHandle extends StatelessWidget {
  const _SrsHandle();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: _handleWidth,
        height: _handleHeight,
        decoration: BoxDecoration(
          color: Colors.black.withAlpha(51),
          borderRadius: BorderRadius.circular(2),
        ),
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
        duration: _animationDuration,
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
          duration: _animationDuration,
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
