import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../chat/models/tool_card_config.dart';
import '../chat/models/breathing_presets.dart';
import '../chat/widgets/tool_card_widget.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import '../../theme/app_colors.dart';
import 'providers/today_card_provider.dart';

/// Decisions doc round, 15 Sep 2026 §4: the client's default kit has
/// exactly one breathing exercise (box breathing) — no felt-state picker
/// in front of it. Whatever the therapist assigned (if anything) is
/// surfaced here too, not on a separate chooser screen.
class BreathingScreen extends ConsumerStatefulWidget {
  const BreathingScreen({super.key});

  @override
  ConsumerState<BreathingScreen> createState() => _BreathingScreenState();
}

const _defaultToolId = 'box_breathing';

class _BreathingScreenState extends ConsumerState<BreathingScreen> {
  String _activeToolId = _defaultToolId;

  @override
  Widget build(BuildContext context) {
    final todayAsync = ref.watch(todayCardProvider);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const OkuvuAppBarTitle('Breathe'),
      ),
      body: todayAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => _buildSession(
          context,
          assignedExercises: const [],
          defaultPace: 'standard',
        ),
        data: (today) => _buildSession(
          context,
          assignedExercises: today.assignedExercises,
          defaultPace: today.defaultBoxBreathingPacePreset,
        ),
      ),
    );
  }

  Widget _buildSession(
    BuildContext context, {
    required List<AssignedExercise> assignedExercises,
    required String defaultPace,
  }) {
    final activeAssigned = assignedExercises
        .where((e) => e.toolId == _activeToolId)
        .cast<AssignedExercise?>()
        .firstOrNull;
    final pacePreset = _activeToolId == _defaultToolId
        ? breathingPaceFromJson(defaultPace)
        : breathingPaceFromJson(activeAssigned?.pacePreset);
    final activeType = _toolCardTypeFor(_activeToolId);
    final config = _configFor(activeType, pacePreset);

    return Column(
      children: [
        if (assignedExercises.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'From your therapist',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppColors.inkSoft,
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _ExerciseChip(
                      label: 'Box breathing (default)',
                      selected: _activeToolId == _defaultToolId,
                      onTap: () => setState(() => _activeToolId = _defaultToolId),
                    ),
                    for (final exercise in assignedExercises)
                      _ExerciseChip(
                        label: exercise.label,
                        selected: _activeToolId == exercise.toolId,
                        onTap: () => setState(() => _activeToolId = exercise.toolId),
                      ),
                  ],
                ),
              ],
            ),
          ),
        if (isTunable(activeType))
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: _PacePicker(
              current: pacePreset,
              onChanged: (pace) => ref.read(toolPreferenceProvider.notifier).setPacePreset(
                    toolId: _activeToolId,
                    pacePreset: pace.jsonValue,
                  ),
            ),
          ),
        Expanded(child: ToolCardWidget(config: config)),
      ],
    );
  }

  ToolCardType _toolCardTypeFor(String toolId) => toolCardTypeFromJson(toolId);

  ToolCardConfig _configFor(ToolCardType type, BreathingPace pace) {
    if (!isTunable(type)) {
      return ToolCardConfig(type: type);
    }
    return ToolCardConfig(
      type: type,
      breathingConfig: breathingConfigFor(type, pace),
    );
  }
}

class _ExerciseChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _ExerciseChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onTap(),
      selectedColor: AppColors.lavenderTint,
      labelStyle: TextStyle(
        color: selected ? AppColors.royalPurple : AppColors.inkSoft,
        fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
      ),
    );
  }
}

class _PacePicker extends StatelessWidget {
  final BreathingPace current;
  final ValueChanged<BreathingPace> onChanged;

  const _PacePicker({required this.current, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return SegmentedButton<BreathingPace>(
      segments: const [
        ButtonSegment(value: BreathingPace.slower, label: Text('Slower')),
        ButtonSegment(value: BreathingPace.standard, label: Text('Standard')),
        ButtonSegment(value: BreathingPace.faster, label: Text('Faster')),
      ],
      selected: {current},
      onSelectionChanged: (selection) => onChanged(selection.first),
    );
  }
}
