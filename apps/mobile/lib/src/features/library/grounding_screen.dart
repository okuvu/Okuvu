import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../theme/app_colors.dart';
import '../chat/widgets/grounding_card.dart';
import 'worksheet_screen.dart';

/// 5-4-3-2-1 grounding, opened from the Library.
///
/// The exercise itself is the approved one that already existed — the same
/// [GroundingCard] the chat uses, with its own wording and its existing
/// optional note per sense. What this screen adds is only what the approved
/// document adds: the "How are you feeling now?" slider, the closing line, and
/// the two buttons at the end.
class GroundingScreen extends ConsumerWidget {
  const GroundingScreen({super.key});

  static const _toolId = 'grounding_5431';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entryAsync = ref.watch(libraryEntryProvider(_toolId));

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          onPressed: () => context.go('/library'),
        ),
        title: const Text('5-4-3-2-1 grounding'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          const GroundingCard(),
          const SizedBox(height: 24),
          entryAsync.when(
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
            data: (entry) {
              final fields = (entry.content['fields'] as List?) ?? const [];
              final slider = fields.whereType<Map>().firstWhere(
                    (f) => f['type'] == 'scale_0_10',
                    orElse: () => const {},
                  );
              final closing = entry.content['closing'] as Map?;
              return _Ending(
                prompt: slider['prompt'] as String?,
                minLabel: slider['minLabel'] as String?,
                maxLabel: slider['maxLabel'] as String?,
                closingText: closing?['text'] as String?,
                buttons: (closing?['buttons'] as List?)
                        ?.whereType<Map>()
                        .map((b) => (
                              label: b['label'] as String? ?? '',
                              action: b['action'] as String? ?? 'done',
                            ))
                        .toList() ??
                    const [],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _Ending extends StatefulWidget {
  const _Ending({
    required this.prompt,
    required this.closingText,
    required this.buttons,
    this.minLabel,
    this.maxLabel,
  });

  final String? prompt;
  final String? minLabel;
  final String? maxLabel;
  final String? closingText;
  final List<({String label, String action})> buttons;

  @override
  State<_Ending> createState() => _EndingState();
}

class _EndingState extends State<_Ending> {
  double? _value;

  @override
  Widget build(BuildContext context) {
    final prompt = widget.prompt;
    if (prompt == null) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          prompt,
          style: const TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w600,
            color: AppColors.charcoalInk,
          ),
        ),
        const SizedBox(height: 12),
        Slider(
          key: const Key('grounding_feeling_after'),
          value: _value ?? 0,
          min: 0,
          max: 10,
          divisions: 10,
          label: '${(_value ?? 0).round()}',
          onChanged: (v) => setState(() => _value = v),
        ),
        if (widget.minLabel != null || widget.maxLabel != null)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(widget.minLabel ?? '',
                  style: TextStyle(
                      fontSize: 12,
                      color: AppColors.charcoalInk.withValues(alpha: 0.45))),
              Text(widget.maxLabel ?? '',
                  style: TextStyle(
                      fontSize: 12,
                      color: AppColors.charcoalInk.withValues(alpha: 0.45))),
            ],
          ),
        const SizedBox(height: 20),
        if (widget.closingText != null)
          Text(
            widget.closingText!,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 15,
              height: 1.5,
              color: AppColors.charcoalInk,
            ),
          ),
        const SizedBox(height: 20),
        for (final button in widget.buttons)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: button.action == 'treasure_box'
                // The approved closing button. It opens the box itself now:
                // reaching it is one of the two ways the owner asked for after
                // grounding, and it is deliberately not on the crisis screen.
                ? OutlinedButton(
                    key: const Key('grounding_open_treasure'),
                    onPressed: () => context.push('/treasure'),
                    child: Text(button.label),
                  )
                : FilledButton(
                    onPressed: () => context.go('/library'),
                    child: Text(button.label),
                  ),
          ),
      ],
    );
  }
}
