import 'package:flutter/material.dart';

class HomeInsightCard extends StatelessWidget {
  const HomeInsightCard({
    super.key,
    required this.message,
  });

  final String message;

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
          Icon(
            Icons.lightbulb_outline,
            size: 32,
            color: theme.colorScheme.primary,
          ),
          const SizedBox(height: 8),
          Text(
            'Insights',
            style: theme.textTheme.titleMedium,
          ),
          const SizedBox(height: 4),
          Text(
            message,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}
