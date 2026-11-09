import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/providers.dart';
import '../../theme/app_colors.dart';
import '../home/widgets/mood_check_in.dart';
import 'worksheet_screen.dart';

/// Mood check-in, opened from the Library.
///
/// The check-in itself is the one that already exists ([MoodCheckIn]) — the
/// same five choices, saved the same way. The two screens after it are what the
/// approved document adds: what was happening just before, and how strong the
/// feeling is from 0 to 10. They are saved onto the same day's entry.
///
/// The 1-5 daily value and the 0-10 intensity are deliberately separate: the
/// daily value is how the day felt, the intensity is how strong this particular
/// feeling is right now, and only the second one drives the demanding-worksheet
/// gate.
class MoodCheckinScreen extends ConsumerStatefulWidget {
  const MoodCheckinScreen({super.key});

  @override
  ConsumerState<MoodCheckinScreen> createState() => _MoodCheckinScreenState();
}

class _MoodCheckinScreenState extends ConsumerState<MoodCheckinScreen> {
  int? _mood;
  int _step = 0;
  final TextEditingController _trigger = TextEditingController();
  double? _intensity;

  @override
  void dispose() {
    _trigger.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final mood = _mood;
    if (mood == null) return;

    try {
      await ref.read(dioClientProvider).post<dynamic>(
        '/progress/mood/checkin',
        data: {
          'mood_value': mood,
          'trigger': _trigger.text.trim(),
          'intensity_0_10': _intensity?.round(),
        },
      );
      if (mounted) context.go('/library');
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't save that. Please try again.")),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final entryAsync = ref.watch(libraryEntryProvider('mood_checkin'));

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          onPressed: () => context.go('/library'),
        ),
        title: const Text('Mood check-in'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          if (_step == 0) ...[
            MoodCheckIn(onMoodSelected: (mood) => setState(() {
                  _mood = mood;
                  _step = 1;
                })),
            if (_mood != null) ...[
              const SizedBox(height: 16),
              FilledButton(
                key: const Key('mood_continue'),
                onPressed: () => setState(() => _step = 1),
                child: const Text('Continue'),
              ),
            ],
          ],
          if (_step > 0)
            entryAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, __) => const SizedBox.shrink(),
              data: (entry) {
                final fields = (entry.content['fields'] as List?) ?? const [];
                final pieces = fields.whereType<Map>().toList();
                final textPiece = pieces.firstWhere(
                  (f) => f['type'] == 'short_text',
                  orElse: () => const <String, dynamic>{},
                );
                final sliderPiece = pieces.firstWhere(
                  (f) => f['type'] == 'scale_0_10',
                  orElse: () => const <String, dynamic>{},
                );

                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (textPiece['prompt'] != null) ...[
                      Text(
                        textPiece['prompt'] as String,
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w600,
                          color: AppColors.charcoalInk,
                        ),
                      ),
                      if (textPiece['helper'] != null) ...[
                        const SizedBox(height: 6),
                        Text(
                          textPiece['helper'] as String,
                          style: TextStyle(
                            fontSize: 13,
                            height: 1.4,
                            color: AppColors.charcoalInk.withValues(alpha: 0.55),
                          ),
                        ),
                      ],
                      const SizedBox(height: 10),
                      TextField(
                        key: const Key('mood_trigger'),
                        controller: _trigger,
                        maxLength: 500,
                        decoration: InputDecoration(
                          border: const OutlineInputBorder(),
                          hintText: textPiece['example'] as String?,
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    if (sliderPiece['prompt'] != null) ...[
                      Text(
                        sliderPiece['prompt'] as String,
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w600,
                          color: AppColors.charcoalInk,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Slider(
                        key: const Key('mood_intensity'),
                        value: _intensity ?? 0,
                        min: 0,
                        max: 10,
                        divisions: 10,
                        label: '${(_intensity ?? 0).round()}',
                        onChanged: (v) => setState(() => _intensity = v),
                      ),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(sliderPiece['minLabel'] as String? ?? '',
                              style: TextStyle(
                                  fontSize: 12,
                                  color: AppColors.charcoalInk.withValues(alpha: 0.45))),
                          Text(sliderPiece['maxLabel'] as String? ?? '',
                              style: TextStyle(
                                  fontSize: 12,
                                  color: AppColors.charcoalInk.withValues(alpha: 0.45))),
                        ],
                      ),
                      const SizedBox(height: 20),
                    ],
                    FilledButton(
                      key: const Key('mood_save'),
                      onPressed: _mood == null ? null : _save,
                      child: const Text('Save'),
                    ),
                  ],
                );
              },
            ),
        ],
      ),
    );
  }
}
