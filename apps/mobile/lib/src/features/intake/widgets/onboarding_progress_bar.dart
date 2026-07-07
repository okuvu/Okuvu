import 'package:flutter/material.dart';

class OnboardingProgressBar extends StatelessWidget {
  final int filledSegments;

  const OnboardingProgressBar({super.key, required this.filledSegments});

  @override
  Widget build(BuildContext context) {
    const segmentCount = 5;
    const gap = 4.0;

    return SizedBox(
      height: 4,
      child: Row(
        children: List.generate(segmentCount * 2 - 1, (i) {
          if (i.isOdd) return const SizedBox(width: gap);
          final segmentIndex = i ~/ 2;
          final isFilled = segmentIndex < filledSegments;
          return Expanded(
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: isFilled
                    ? const Color(0xFF1A6B5A)
                    : const Color(0xFFE8E4DF),
                borderRadius: segmentIndex == 0
                    ? const BorderRadius.only(
                        topLeft: Radius.circular(2),
                        bottomLeft: Radius.circular(2),
                      )
                    : segmentIndex == segmentCount - 1
                        ? const BorderRadius.only(
                            topRight: Radius.circular(2),
                            bottomRight: Radius.circular(2),
                          )
                        : BorderRadius.zero,
              ),
            ),
          );
        }),
      ),
    );
  }
}
