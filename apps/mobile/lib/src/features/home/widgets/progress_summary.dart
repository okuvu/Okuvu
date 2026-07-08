import 'package:flutter/material.dart';

// TODO(E8-S01): Replace with real streak data from backend once available.
const String _placeholderStreak = '3';
// TODO(E8-S01): Replace with real check-in count from backend once available.
const String _placeholderCheckInCount = '12';

class ProgressSummary extends StatelessWidget {
  const ProgressSummary({
    super.key,
    this.showData = false,
  });

  final bool showData;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (!showData) {
      return _buildEmptyState(theme);
    }

    return _buildDataState(theme);
  }

  Widget _buildEmptyState(ThemeData theme) {
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
            Icons.trending_up,
            size: 32,
            color: theme.colorScheme.onSurfaceVariant,
          ),
          const SizedBox(height: 8),
          Text(
            'No mood check-ins yet',
            style: theme.textTheme.titleMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Your progress will appear here after your first check-in.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildDataState(ThemeData theme) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          const Row(
            children: [
              _StatTile(
                icon: Icons.local_fire_department,
                value: _placeholderStreak,
                label: 'day streak',
                color: Color(0xFFE8A020),
              ),
              SizedBox(width: 24),
              _StatTile(
                icon: Icons.check_circle_outline,
                value: _placeholderCheckInCount,
                label: 'check-ins',
                color: Color(0xFF2D8A5E),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            'Gaps happen. You\'re still here.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              fontStyle: FontStyle.italic,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({
    required this.icon,
    required this.value,
    required this.label,
    required this.color,
  });

  final IconData icon;
  final String value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Expanded(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 28, color: color),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              Text(
                label,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
