import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/providers.dart';
import '../../../theme/app_colors.dart';
import '../../mood/mood_vocabulary.dart';
import '../../mood/providers/mood_provider.dart';
import '../../mood/widgets/mood_face.dart';

/// The Home card's quick check-in.
///
/// Five faces instead of 1-5 numbers, drawn in the app (`MoodFaceRow`) with the
/// word under each. One tap saves that day's face; the words and the strength
/// slider live on the full screen at `/library/mood`.
///
/// A quick tap deliberately does NOT send the words: the day's entry may already
/// carry some from the full screen, and re-tapping a face here must not clear
/// them.
class MoodCheckIn extends ConsumerStatefulWidget {
  const MoodCheckIn({super.key, this.onMoodSelected});

  /// Called after a check-in is saved. The Library uses it to continue into the
  /// rest of the check-in; Home passes nothing and behaves exactly as before.
  final void Function(int mood)? onMoodSelected;

  @override
  ConsumerState<MoodCheckIn> createState() => _MoodCheckInState();
}

class _MoodCheckInState extends ConsumerState<MoodCheckIn> {
  int? _selectedMood;
  Timer? _dismissTimer;

  @override
  void dispose() {
    _dismissTimer?.cancel();
    super.dispose();
  }

  void _selectMood(int mood) {
    _dismissTimer?.cancel();

    if (_selectedMood == mood) {
      setState(() => _selectedMood = null);
      return;
    }

    setState(() => _selectedMood = mood);

    if (mood >= 4) {
      _dismissTimer = Timer(const Duration(seconds: 3), () {
        if (mounted) {
          setState(() {
            _selectedMood = null;
          });
        }
      });
    }

    ref.read(moodCheckinProvider.notifier).save(mood: mood).then((outcome) {
      if (outcome.ok && mounted) {
        widget.onMoodSelected?.call(mood);
      }
      if (!outcome.ok && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Couldn't save your check-in. Please try again."),
          ),
        );
      }
      if (outcome.showHelp && mounted) {
        ref.read(crisisOverlayProvider.notifier).show();
      }
    });
  }

  void _dismissResponse() {
    _dismissTimer?.cancel();
    setState(() {
      _selectedMood = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final face = moodFaceFor(_selectedMood);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Text(
            'How are you feeling today?',
            style: theme.textTheme.titleMedium,
          ),
          const SizedBox(height: 16),
          MoodFaceRow(selected: _selectedMood, onSelected: _selectMood, faceSize: 44),
          if (face != null) ...[
            const SizedBox(height: 14),
            Text(
              'Feeling ${face.label}',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: face.stroke,
                fontWeight: FontWeight.w600,
              ),
            ),
            if (_selectedMood! <= 2) ...[
              const SizedBox(height: 12),
              Text(
                'Want to talk about it?',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurface,
                ),
              ),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: () => context.go('/chat'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.violet,
                ),
                child: const Text('Check in'),
              ),
              const SizedBox(height: 4),
              TextButton(
                onPressed: _dismissResponse,
                child: const Text('Maybe later'),
              ),
            ] else if (_selectedMood! >= 4) ...[
              const SizedBox(height: 12),
              Text(
                'Glad to hear that. Have a good one.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.inkSoft,
                ),
              ),
            ],
            const SizedBox(height: 6),
            TextButton(
              key: const Key('mood_add_words'),
              onPressed: () => context.push('/library/mood'),
              child: const Text('Add words or strength'),
            ),
          ],
        ],
      ),
    );
  }
}
