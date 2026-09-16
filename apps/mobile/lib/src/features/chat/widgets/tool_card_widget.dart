import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import 'guided_breathing_card.dart';
import '../models/tool_card_config.dart';
import 'grounding_card.dart';

class ToolCardWidget extends StatelessWidget {
  final ToolCardConfig config;
  const ToolCardWidget({required this.config, super.key});

  @override
  Widget build(BuildContext context) {
    switch (config.type) {
      case ToolCardType.guidedBreathing:
      case ToolCardType.boxBreathing:
      case ToolCardType.physiologicalSigh:
      case ToolCardType.extendedExhale:
        return GuidedBreathingCard(config: config);
      case ToolCardType.grounding5431:
        return const GroundingCard();
    }
  }
}

class GroundingCard extends StatelessWidget {
  const GroundingCard({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(LucideIcons.mountain,
                    size: 20, color: theme.colorScheme.primary),
                const SizedBox(width: 8),
                Text(
                  '5-4-3-2-1 Grounding',
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
                    color: theme.colorScheme.primary,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _GroundingStep(
              number: '5',
              label: 'things you can see',
              icon: LucideIcons.eye,
            ),
            _GroundingStep(
              number: '4',
              label: 'things you can touch',
              icon: LucideIcons.pointer,
            ),
            _GroundingStep(
              number: '3',
              label: 'things you can hear',
              icon: LucideIcons.ear,
            ),
            _GroundingStep(
              number: '2',
              label: 'things you can smell',
              icon: LucideIcons.sunset,
            ),
            _GroundingStep(
              number: '1',
              label: 'thing you can taste',
              icon: LucideIcons.utensils,
            ),
          ],
        ),
      ),
    );
  }
}

class _GroundingStep extends StatelessWidget {
  final String number;
  final String label;
  final IconData icon;

  const _GroundingStep({
    required this.number,
    required this.label,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: theme.colorScheme.primaryContainer,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Center(
              child: Text(
                number,
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                  color: theme.colorScheme.onPrimaryContainer,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Icon(icon, size: 18, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(width: 8),
          Text(
            label,
            style: TextStyle(
              fontSize: 14,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}
