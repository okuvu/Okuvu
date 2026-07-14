import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

const Map<int, Color> kMoodColors = {
  1: Color(0xFFE8A020),
  2: Color(0xFFD4956A),
  3: Color(0xFF6B6B6B),
  4: Color(0xFF2D8A5E),
  5: Color(0xFF1A6B5A),
};

const Map<int, String> kMoodLabels = {
  1: 'Struggling',
  2: 'Down',
  3: 'Okay',
  4: 'Good',
  5: 'Great',
};

class MoodCheckIn extends StatefulWidget {
  const MoodCheckIn({super.key});

  @override
  State<MoodCheckIn> createState() => _MoodCheckInState();
}

class _MoodCheckInState extends State<MoodCheckIn> {
  int? _selectedMood;
  Timer? _dismissTimer;

  @override
  void dispose() {
    _dismissTimer?.cancel();
    super.dispose();
  }

  void _selectMood(int mood) {
    _dismissTimer?.cancel();
    setState(() {
      if (_selectedMood == mood) {
        _selectedMood = null;
      } else {
        _selectedMood = mood;
        if (mood >= 4) {
          _dismissTimer = Timer(const Duration(seconds: 3), () {
            if (mounted) {
              setState(() {
                _selectedMood = null;
              });
            }
          });
        }
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
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: List.generate(5, (index) {
              final mood = index + 1;
              final color = kMoodColors[mood]!;
              final isSelected = _selectedMood == mood;

              return GestureDetector(
                onTap: () => _selectMood(mood),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  width: isSelected ? 56 : 48,
                  height: isSelected ? 56 : 48,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isSelected ? color : null,
                    border: Border.all(
                      color: isSelected ? color : color.withAlpha(128),
                      width: 2,
                    ),
                  ),
                  child: Center(
                    child: Text(
                      '$mood',
                      style: TextStyle(
                        fontSize: isSelected ? 20 : 16,
                        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                        color: isSelected ? Colors.white : color,
                      ),
                    ),
                  ),
                ),
              );
            }),
          ),
          if (_selectedMood != null) ...[
            const SizedBox(height: 16),
            Text(
              'Feeling ${kMoodLabels[_selectedMood]!}',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: kMoodColors[_selectedMood],
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
                  backgroundColor: const Color(0xFF1A6B5A),
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
                  color: const Color(0xFF6B6B6B),
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }
}
