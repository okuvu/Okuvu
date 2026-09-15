import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/providers.dart';
import '../models/grounding_result.dart';

class GroundingCard extends ConsumerStatefulWidget {
  const GroundingCard({super.key});

  @override
  ConsumerState<GroundingCard> createState() => _GroundingCardState();
}

class _GroundingCardState extends ConsumerState<GroundingCard> {
  static const _senseConfigs = [
    _SenseConfig(5, LucideIcons.eye, 'things you can see'),
    _SenseConfig(4, LucideIcons.pointer, 'things you can touch'),
    _SenseConfig(3, LucideIcons.ear, 'things you can hear'),
    _SenseConfig(2, LucideIcons.sunset, 'things you can smell'),
    _SenseConfig(1, LucideIcons.utensils, 'thing you can taste'),
  ];

  int _currentSenseIndex = 0;
  final List<List<String>> _items = List.generate(5, (_) => []);
  final TextEditingController _textController = TextEditingController();
  final FocusNode _textFocusNode = FocusNode();
  bool _completed = false;
  bool _wasSkipped = false;

  _SenseConfig get _currentConfig => _senseConfigs[_currentSenseIndex];

  @override
  void dispose() {
    _textController.dispose();
    _textFocusNode.dispose();
    super.dispose();
  }

  void _addItem() {
    if (_completed) return;
    final text = _textController.text.trim();
    if (text.isEmpty) return;

    setState(() {
      _items[_currentSenseIndex].add(text);
      _textController.clear();

      if (_items[_currentSenseIndex].length >= _currentConfig.requiredCount) {
        if (_currentSenseIndex < 4) {
          _currentSenseIndex++;
          _textFocusNode.requestFocus();
        } else {
          _completed = true;
          _sendResult();
        }
      } else {
        _textFocusNode.requestFocus();
      }
    });
  }

  void _skip() {
    setState(() {
      _completed = true;
      _wasSkipped = true;
    });
  }

  void _sendResult() {
    final ws = ref.read(webSocketServiceProvider);
    ws.sendToolResult(GroundingResult(
      see: List.unmodifiable(_items[0]),
      touch: List.unmodifiable(_items[1]),
      hear: List.unmodifiable(_items[2]),
      smell: List.unmodifiable(_items[3]),
      taste: List.unmodifiable(_items[4]),
    ));
  }

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
      child: AnimatedSize(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
        alignment: Alignment.topCenter,
        child: _completed ? _buildCollapsed(theme) : _buildActive(theme),
      ),
    );
  }

  Widget _buildCollapsed(ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Icon(
            _wasSkipped ? LucideIcons.minusCircle : LucideIcons.checkCircle2,
            size: 18,
            color: _wasSkipped
                ? theme.colorScheme.onSurfaceVariant
                : theme.colorScheme.primary,
          ),
          const SizedBox(width: 8),
          Text(
            _wasSkipped ? 'Grounding exercise skipped' : 'Grounding exercise complete',
            style: TextStyle(
              fontSize: 14,
              color: _wasSkipped
                  ? theme.colorScheme.onSurfaceVariant
                  : theme.colorScheme.onSurface,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActive(ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildHeader(theme),
            const SizedBox(height: 16),
            _buildProgressDots(theme),
            const SizedBox(height: 16),
            _buildPrompt(theme),
            const SizedBox(height: 12),
            _buildPills(theme),
            const SizedBox(height: 8),
            _buildInputRow(theme),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(ThemeData theme) {
    return Row(
      children: [
        Icon(LucideIcons.mountain, size: 20, color: theme.colorScheme.primary),
        const SizedBox(width: 8),
        Text(
          '5-4-3-2-1 Grounding',
          style: TextStyle(
            fontWeight: FontWeight.w600,
            fontSize: 15,
            color: theme.colorScheme.primary,
          ),
        ),
        const Spacer(),
        TextButton(
          onPressed: _skip,
          style: TextButton.styleFrom(
            foregroundColor: theme.colorScheme.onSurfaceVariant,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            minimumSize: Size.zero,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          child: const Text('Skip', style: TextStyle(fontSize: 13)),
        ),
      ],
    );
  }

  Widget _buildProgressDots(ThemeData theme) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(5, (i) {
        final isCompleted = i < _currentSenseIndex;
        final isCurrent = i == _currentSenseIndex;
        return Container(
          width: 10,
          height: 10,
          margin: const EdgeInsets.only(right: 8),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: isCompleted
                ? theme.colorScheme.primary
                : isCurrent
                    ? theme.colorScheme.primary.withAlpha(80)
                    : Colors.transparent,
            border: Border.all(
              color: isCompleted || isCurrent
                  ? theme.colorScheme.primary
                  : theme.colorScheme.outlineVariant,
            ),
          ),
        );
      }),
    );
  }

  Widget _buildPrompt(ThemeData theme) {
    final cfg = _currentConfig;
    final count = _items[_currentSenseIndex].length;
    return Row(
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
              '${cfg.requiredCount}',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 16,
                color: theme.colorScheme.onPrimaryContainer,
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Icon(cfg.icon, size: 18, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(width: 8),
        Text(
          cfg.label,
          style: TextStyle(
            fontSize: 14,
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const Spacer(),
        Text(
          '$count/${cfg.requiredCount}',
          style: TextStyle(
            fontSize: 12,
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }

  Widget _buildPills(ThemeData theme) {
    final items = _items[_currentSenseIndex];
    if (items.isEmpty) return const SizedBox.shrink();

    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: items.map((item) {
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: theme.colorScheme.primary,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            item,
            style: TextStyle(
              fontSize: 13,
              color: theme.colorScheme.onPrimary,
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildInputRow(ThemeData theme) {
    return Row(
      children: [
        Expanded(
          child: TextField(
            controller: _textController,
            focusNode: _textFocusNode,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _addItem(),
            decoration: InputDecoration(
              filled: true,
              fillColor: theme.colorScheme.surface,
              hintText: 'Type something...',
              hintStyle: TextStyle(
                color: theme.colorScheme.onSurfaceVariant.withAlpha(120),
              ),
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 12,
                vertical: 10,
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: BorderSide(color: theme.colorScheme.outlineVariant),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: BorderSide(color: theme.colorScheme.outlineVariant),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: BorderSide(color: theme.colorScheme.primary),
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        IconButton(
          onPressed: _addItem,
          icon: Icon(
            _items[_currentSenseIndex].length >= _currentConfig.requiredCount - 1
                ? LucideIcons.check
                : LucideIcons.plusCircle,
            size: 22,
          ),
          style: IconButton.styleFrom(
            backgroundColor: theme.colorScheme.primary,
            foregroundColor: theme.colorScheme.onPrimary,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
        ),
      ],
    );
  }
}

class _SenseConfig {
  final int requiredCount;
  final IconData icon;
  final String label;

  const _SenseConfig(this.requiredCount, this.icon, this.label);
}
