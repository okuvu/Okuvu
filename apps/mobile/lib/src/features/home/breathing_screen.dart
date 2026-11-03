import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../chat/models/tool_card_config.dart';
import '../chat/models/breathing_presets.dart';
import '../chat/widgets/tool_card_widget.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import '../../theme/app_colors.dart';
import 'breathing_content.dart';
import 'providers/today_card_provider.dart';

/// The Breathe screen.
///
/// Owner round 2 (4 Nov 2026) reshaped the top of this screen twice over:
///
/// * The four techniques were a `Wrap` of chips that grew to four rows and
///   pushed the breathing guide off the bottom of the screen, which is the
///   part of the page a client actually watches. They are now one drop-down.
/// * The Slower / Standard / Faster picker is gone. Each technique has one
///   normal pace (the `standard` preset), because three paces for each of four
///   techniques gave the client twelve choices and no guidance.
///
/// The (i) beside the chooser opens the written explanation for whichever
/// technique is showing — Dr Goswami's copy, in `breathing_content.dart`.
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
        error: (_, __) => _buildSession(const []),
        data: (today) => _buildSession(today.assignedExercises),
      ),
    );
  }

  Widget _buildSession(List<AssignedExercise> assignedExercises) {
    final assignedIds = assignedExercises.map((e) => e.toolId).toSet();
    final extras =
        assignedExercises.where((e) => breathingTechniqueFor(e.toolId) == null).toList();
    final activeTechnique = breathingTechniqueFor(_activeToolId);
    AssignedExercise? activeExtra;
    for (final extra in extras) {
      if (extra.toolId == _activeToolId) activeExtra = extra;
    }

    final items = <DropdownMenuItem<String>>[
      for (final technique in breathingTechniques)
        DropdownMenuItem(
          value: technique.toolId,
          child: Text(_exerciseLabel(
            technique.name,
            isDefault: technique.toolId == _defaultToolId,
            assigned: assignedIds.contains(technique.toolId),
          )),
        ),
      for (final extra in extras)
        DropdownMenuItem(
          value: extra.toolId,
          child: Text(_exerciseLabel(extra.label, assigned: true)),
        ),
    ];

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  key: const Key('breathing_exercise_dropdown'),
                  initialValue: _activeToolId,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Exercise',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  items: items,
                  onChanged: (value) {
                    if (value == null) return;
                    setState(() => _activeToolId = value);
                  },
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                key: const Key('breathing_explain_button'),
                tooltip: activeTechnique != null
                    ? 'What is ${activeTechnique.name}?'
                    : 'About this exercise',
                icon: const Icon(LucideIcons.info, color: AppColors.violet),
                onPressed: () => _showExplanation(
                  technique: activeTechnique,
                  extra: activeExtra,
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: SingleChildScrollView(
            child: ToolCardWidget(
              // A new exercise must start its own sitting: keying the card by
              // tool id throws away the previous State, including any running
              // count and any "Done" screen it had reached.
              key: ValueKey(_activeToolId),
              config: _configFor(_activeToolId),
            ),
          ),
        ),
      ],
    );
  }

  String _exerciseLabel(String name, {bool isDefault = false, bool assigned = false}) {
    final withDefault = isDefault ? '$name (default)' : name;
    return assigned ? '$withDefault · from your therapist' : withDefault;
  }

  /// One normal pace per technique: the `standard` preset table. There is no
  /// picker, so nothing here reads the saved preference — an older saved
  /// non-standard pace no longer changes what is shown.
  ToolCardConfig _configFor(String toolId) {
    final type = toolCardTypeFromJson(toolId);
    if (!isTunable(type)) return ToolCardConfig(type: type);
    return ToolCardConfig(
      type: type,
      breathingConfig: breathingConfigFor(type, BreathingPace.standard),
    );
  }

  void _showExplanation({
    required BreathingTechnique? technique,
    required AssignedExercise? extra,
  }) {
    final sections = technique?.explanation ??
        <BreathingSection>[
          if ((extra?.text ?? '').isNotEmpty)
            BreathingSection('About this exercise', extra!.text),
        ];
    final title = technique?.cardLabel ?? extra?.label ?? 'Exercise';

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.6,
        minChildSize: 0.35,
        maxChildSize: 0.95,
        builder: (context, scrollController) => ListView(
          controller: scrollController,
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
          children: [
            Text(title,
                style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w600,
                    color: AppColors.charcoalInk)),
            if (technique != null) ...[
              const SizedBox(height: 4),
              Text(technique.paceLine,
                  style: TextStyle(
                      fontSize: 13,
                      color: AppColors.charcoalInk.withValues(alpha: 0.55))),
            ],
            const SizedBox(height: 16),
            for (final section in sections) ...[
              Text(section.heading,
                  style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppColors.violet)),
              const SizedBox(height: 4),
              Text(section.body,
                  style: const TextStyle(
                      fontSize: 15, height: 1.45, color: AppColors.charcoalInk)),
              const SizedBox(height: 16),
            ],
            const SizedBox(height: 4),
            FilledButton(
              key: const Key('breathing_explanation_close'),
              onPressed: () => Navigator.of(context).pop(),
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
                backgroundColor: AppColors.violet,
              ),
              child: const Text('Got it'),
            ),
          ],
        ),
      ),
    );
  }
}
