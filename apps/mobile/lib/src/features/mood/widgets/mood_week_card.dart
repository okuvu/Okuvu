import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';
import '../models/mood_week_summary.dart';
import '../mood_vocabulary.dart';
import 'mood_face.dart';

/// "Your week" — how many times each face was chosen in the last seven days, and
/// the three words chosen most often.
///
/// Only the summary: no score, no advice, no comparison, and no streak. This card
/// is the client's alone and is never rendered in the therapist portal.
class MoodWeekCard extends StatelessWidget {
  const MoodWeekCard({super.key, required this.summary});

  final MoodWeekSummary summary;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('mood_week_card'),
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.oatElevated,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Your week',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.4,
              color: AppColors.inkSoft,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            summary.sentence,
            key: const Key('mood_week_sentence'),
            style: const TextStyle(
              fontSize: 15,
              height: 1.35,
              color: AppColors.charcoalInk,
            ),
          ),
          const SizedBox(height: 14),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              for (final face in kMoodFaces)
                Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    MoodFace(value: face.value, size: 30),
                    const SizedBox(height: 4),
                    Text(
                      '${summary.faceCounts[face.value] ?? 0}',
                      key: Key('mood_week_count_${face.value}'),
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppColors.charcoalInk,
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ],
      ),
    );
  }
}
