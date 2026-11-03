import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../chat/models/tool_card_config.dart';
import '../chat/models/breathing_presets.dart';
import '../chat/widgets/tool_card_widget.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import '../../theme/app_colors.dart';
import 'providers/today_card_provider.dart';

/// Owner round 2 (3 Nov 2026): the client kit is no longer limited to the
/// single box-breathing default of the 15 Sep 2026 decisions round — every
/// clinically-approved exercise the therapist portal can assign is offered
/// here. Order is fixed so the default stays first; an exercise the therapist
/// assigned is marked as such, and an assigned tool that isn't a breathing
/// exercise (5-4-3-2-1 grounding) is appended rather than dropped.
class BreathingScreen extends ConsumerStatefulWidget {
  const BreathingScreen({super.key});

  @override
  ConsumerState<BreathingScreen> createState() => _BreathingScreenState();
}

const _defaultToolId = 'box_breathing';

/// The breathing exercises, in the order they are offered. Kept in step with
/// the therapist portal's exercise list (ToolRegistryEntry) and with the
/// preset tables in breathing_presets.dart.
const _breathingToolIds = <String>[
  'box_breathing',
  'guided_breathing',
  'physiological_sigh',
  'extended_exhale',
];

const _exerciseNames = <String, String>{
  'box_breathing': 'Box breathing',
  'guided_breathing': 'Guided breathing',
  'physiological_sigh': 'Physiological sigh',
  'extended_exhale': 'Extended exhale',
};

class _BreathingScreenState extends ConsumerState<BreathingScreen> {
  String _activeToolId = _defaultToolId;

  /// Paces the client changed in this visit. Read before the saved presets, so
  /// a change shows immediately while the PATCH is in flight.
  final Map<String, BreathingPace> _paceOverride = {};

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
          savedPaces: const {},
        ),
        data: (today) => _buildSession(
          context,
          assignedExercises: today.assignedExercises,
          defaultPace: today.defaultBoxBreathingPacePreset,
          savedPaces: today.toolPacePresets,
        ),
      ),
    );
  }

  Widget _buildSession(
    BuildContext context, {
    required List<AssignedExercise> assignedExercises,
    required String defaultPace,
    required Map<String, String> savedPaces,
  }) {
    final assignedIds = assignedExercises.map((e) => e.toolId).toSet();
    final extraAssigned =
        assignedExercises.where((e) => !_breathingToolIds.contains(e.toolId)).toList();
    final pacePreset = _paceFor(_activeToolId, savedPaces, defaultPace, assignedExercises);
    final activeType = _toolCardTypeFor(_activeToolId);
    final config = _configFor(activeType, pacePreset);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Choose an exercise',
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
                  for (final toolId in _breathingToolIds)
                    _ExerciseChip(
                      label: _chipLabel(toolId, assigned: assignedIds.contains(toolId)),
                      selected: _activeToolId == toolId,
                      onTap: () => setState(() => _activeToolId = toolId),
                    ),
                  for (final exercise in extraAssigned)
                    _ExerciseChip(
                      label: exercise.label,
                      assigned: true,
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
              onChanged: (pace) {
                final toolId = _activeToolId;
                setState(() => _paceOverride[toolId] = pace);
                ref.read(toolPreferenceProvider.notifier).setPacePreset(
                      toolId: toolId,
                      pacePreset: pace.jsonValue,
                    );
              },
            ),
          ),
        // Scrollable since owner round 2 (3 Nov 2026): the exercise chips are
        // always on screen now, so on a short device the card can no longer
        // rely on the leftover height alone.
        Expanded(
          child: SingleChildScrollView(child: ToolCardWidget(config: config)),
        ),
      ],
    );
  }

  /// Saved preset for this exercise, else the exercise's assigned preset, else
  /// standard. Box breathing keeps falling back to the older single-default
  /// field so existing clients read the same pace they always did.
  BreathingPace _paceFor(
    String toolId,
    Map<String, String> savedPaces,
    String defaultPace,
    List<AssignedExercise> assignedExercises,
  ) {
    final changed = _paceOverride[toolId];
    if (changed != null) return changed;

    final saved = savedPaces[toolId] ?? (toolId == _defaultToolId ? defaultPace : null);
    if (saved != null) return breathingPaceFromJson(saved);

    for (final exercise in assignedExercises) {
      if (exercise.toolId == toolId) return breathingPaceFromJson(exercise.pacePreset);
    }
    return BreathingPace.standard;
  }

  String _chipLabel(String toolId, {required bool assigned}) {
    final name = _exerciseNames[toolId] ?? toolId;
    final withDefault = toolId == _defaultToolId ? '$name (default)' : name;
    return assigned ? '$withDefault · from your therapist' : withDefault;
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
  final bool assigned;
  final VoidCallback onTap;

  const _ExerciseChip({
    required this.label,
    required this.selected,
    required this.onTap,
    this.assigned = false,
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
        fontWeight: selected || assigned ? FontWeight.w600 : FontWeight.normal,
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
