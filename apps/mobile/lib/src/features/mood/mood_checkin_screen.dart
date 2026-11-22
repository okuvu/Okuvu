import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/providers.dart';
import '../../theme/app_colors.dart';
import '../sharing/sharing.dart';
import 'models/mood_entry.dart';
import 'models/mood_week_summary.dart';
import 'mood_vocabulary.dart';
import 'providers/mood_provider.dart';
import 'widgets/gentle_support_card.dart';
import 'widgets/mood_face.dart';
import 'widgets/mood_week_card.dart';

/// The mood check-in.
///
/// Step 1 (required): five faces with their words. The face IS the 1-5 value —
/// 1 = Awful … 5 = Great — so every check-in written before this screen existed
/// still means what it said.
///
/// Step 2 (optional): up to three feeling chips, an optional "Something else"
/// box, and a 1-5 strength slider. "Skip" is a real skip: the client can save
/// with nothing but a face.
///
/// After a save the client sees "Your week" (their own summary, never the
/// therapist's) and their own check-ins, each with its own share switch — off
/// until they turn it on.
///
/// Choosing "hopeless" or "numb" shows a gentle card. That card is not a crisis
/// alert and nothing is sent to the therapist because of it; the only automatic
/// escalation on this screen is the api's check of the free-text box, which is
/// the same check chat and the journal run.
class MoodCheckinScreen extends ConsumerStatefulWidget {
  const MoodCheckinScreen({super.key});

  @override
  ConsumerState<MoodCheckinScreen> createState() => _MoodCheckinScreenState();
}

class _MoodCheckinScreenState extends ConsumerState<MoodCheckinScreen> {
  int? _mood;
  final Set<String> _words = <String>{};
  final TextEditingController _other = TextEditingController();
  bool _otherOpen = false;
  bool _wordsSkipped = false;
  int? _strength;
  bool _saving = false;
  bool _showGentleCard = false;

  @override
  void dispose() {
    _other.dispose();
    super.dispose();
  }

  void _selectFace(int value) {
    setState(() {
      _mood = value;
      _showGentleCard = false;
    });
  }

  void _toggleWord(String word) {
    setState(() {
      if (_words.contains(word)) {
        _words.remove(word);
        return;
      }
      if (_words.length >= kMaxFeelingWords) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('You can pick up to 3 words.')),
        );
        return;
      }
      _words.add(word);
    });
  }

  void _skipWords() {
    setState(() {
      _words.clear();
      _otherOpen = false;
      _other.clear();
      _wordsSkipped = true;
    });
  }

  void _addWordsAgain() {
    setState(() => _wordsSkipped = false);
  }

  Future<void> _save() async {
    final mood = _mood;
    if (mood == null || _saving) return;

    setState(() => _saving = true);

    final words = _wordsSkipped ? <String>[] : _words.toList();
    final other = !_wordsSkipped && _otherOpen ? _other.text.trim() : null;

    final outcome = await ref.read(moodCheckinProvider.notifier).save(
          mood: mood,
          words: words,
          other: other,
          strength: _strength,
        );

    if (!mounted) return;

    setState(() {
      _saving = false;
      if (outcome.ok) {
        // The card is decided by the chips the client actually saved, and only
        // when the words step was used at all.
        _showGentleCard = !_wordsSkipped && showsGentleCard(_words);
        _mood = null;
        _words.clear();
        _otherOpen = false;
        _other.clear();
        _wordsSkipped = false;
        _strength = null;
      }
    });

    if (!outcome.ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't save that. Please try again.")),
      );
      return;
    }

    if (outcome.showHelp) {
      // The free-text box was screened inside the write and the check found
      // something. Same card chat and the journal raise.
      ref.read(crisisOverlayProvider.notifier).show();
    } else if (outcome.helpOffer) {
      // The check could not run: an offer, never a claim, and never silence.
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('Help is here if you need it.'),
          duration: const Duration(seconds: 8),
          action: SnackBarAction(
            label: 'Get help',
            onPressed: () => ref.read(crisisOverlayProvider.notifier).show(),
          ),
        ),
      );
    }
  }

  void _openSupportLines() {
    setState(() => _showGentleCard = false);
    // The app's existing helpline screen — not a second list of numbers.
    ref.read(crisisOverlayProvider.notifier).show();
  }

  Future<void> _setShared(MoodEntry entry, bool value) async {
    final notifier = ref.read(sharingProvider.notifier);

    if (value) {
      final firstTime = await notifier.shouldConfirmFirstShare();
      if (firstTime) {
        if (!mounted) return;
        final confirmed = await confirmFirstShare(context);
        if (!confirmed) return;
        await notifier.markFirstShareSeen();
      }
    }

    final ok = await notifier.setShared(
      kind: 'mood_log',
      id: entry.id,
      shared: value,
    );
    if (!mounted) return;
    if (ok) {
      ref.invalidate(moodEntriesProvider);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't change sharing. Please try again.")),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final entriesAsync = ref.watch(moodEntriesProvider);
    final entries = entriesAsync.asData?.value ?? const <MoodEntry>[];
    final summary = MoodWeekSummary.from(entries);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          key: const Key('mood_back'),
          icon: const Icon(LucideIcons.arrowLeft),
          onPressed: () => context.go('/library'),
        ),
        title: const Text('Mood check-in'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          if (_showGentleCard) ...[
            GentleSupportCard(
              onTalkInChat: () => context.go('/chat'),
              onSeeSupportLines: _openSupportLines,
              onNotNow: () => setState(() => _showGentleCard = false),
            ),
            const SizedBox(height: 16),
          ],
          const Text(
            'How are you feeling today?',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: AppColors.charcoalInk,
            ),
          ),
          const SizedBox(height: 14),
          MoodFaceRow(selected: _mood, onSelected: _selectFace),
          const SizedBox(height: 8),
          if (_mood == null)
            Text(
              'Tap the face that fits today.',
              key: const Key('mood_face_hint'),
              style: TextStyle(
                fontSize: 13,
                color: AppColors.charcoalInk.withValues(alpha: 0.55),
              ),
            ),
          if (_mood != null) ...[
            const SizedBox(height: 12),
            const Divider(height: 24, color: AppColors.hairline),
            Row(
              children: [
                const Expanded(
                  child: Text(
                    kFeelingQuestion,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: AppColors.charcoalInk,
                    ),
                  ),
                ),
                if (!_wordsSkipped)
                  TextButton(
                    key: const Key('mood_words_skip'),
                    onPressed: _skipWords,
                    child: const Text(kSkipLabel),
                  ),
              ],
            ),
            if (_wordsSkipped)
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Words skipped.',
                      key: Key('mood_words_skipped'),
                      style: TextStyle(fontSize: 13, color: AppColors.inkSoft),
                    ),
                  ),
                  TextButton(
                    key: const Key('mood_words_add'),
                    onPressed: _addWordsAgain,
                    child: const Text('Add words'),
                  ),
                ],
              )
            else ...[
              const SizedBox(height: 4),
              for (final group in kFeelingGroups) ...[
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    for (final word in group)
                      FilterChip(
                        key: Key('mood_word_$word'),
                        label: Text(word),
                        selected: _words.contains(word),
                        onSelected: (_) => _toggleWord(word),
                        selectedColor: AppColors.lavenderTint,
                        checkmarkColor: AppColors.royalPurple,
                        labelStyle: TextStyle(
                          fontSize: 13,
                          color: _words.contains(word)
                              ? AppColors.royalPurple
                              : AppColors.charcoalInk,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 6),
              ],
              const SizedBox(height: 2),
              Wrap(
                children: [
                  FilterChip(
                    key: const Key('mood_something_else'),
                    label: const Text(kFeelingOtherLabel),
                    selected: _otherOpen,
                    onSelected: (selected) =>
                        setState(() => _otherOpen = selected),
                    selectedColor: AppColors.lavenderTint,
                    checkmarkColor: AppColors.royalPurple,
                    labelStyle: TextStyle(
                      fontSize: 13,
                      color: _otherOpen
                          ? AppColors.royalPurple
                          : AppColors.charcoalInk,
                    ),
                  ),
                ],
              ),
              if (_otherOpen) ...[
                const SizedBox(height: 8),
                TextField(
                  key: const Key('mood_other_field'),
                  controller: _other,
                  maxLength: kFeelingOtherMax,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(
                    border: OutlineInputBorder(),
                    hintText: 'A word or two of your own',
                  ),
                ),
              ],
            ],
            const SizedBox(height: 12),
            const Divider(height: 24, color: AppColors.hairline),
            Row(
              children: [
                const Expanded(
                  child: Text(
                    kStrengthQuestion,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: AppColors.charcoalInk,
                    ),
                  ),
                ),
                Text(
                  'Optional',
                  style: TextStyle(
                    fontSize: 12,
                    color: AppColors.charcoalInk.withValues(alpha: 0.45),
                  ),
                ),
              ],
            ),
            Slider(
              key: const Key('mood_strength'),
              value: (_strength ?? 3).toDouble(),
              min: kStrengthMin.toDouble(),
              max: kStrengthMax.toDouble(),
              divisions: kStrengthMax - kStrengthMin,
              label: '${_strength ?? 3}',
              onChanged: (value) => setState(() => _strength = value.round()),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '$kStrengthMin · $kStrengthLowLabel',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.charcoalInk.withValues(alpha: 0.45),
                    ),
                  ),
                  Text(
                    '$kStrengthMax · $kStrengthHighLabel',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.charcoalInk.withValues(alpha: 0.45),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            FilledButton(
              key: const Key('mood_save'),
              onPressed: _saving ? null : _save,
              child: _saving
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Save'),
            ),
            const SizedBox(height: 24),
          ],
          MoodWeekCard(summary: summary),
          const SizedBox(height: 20),
          const Text(
            'Your check-ins',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.charcoalInk,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'These are private. Turn sharing on for any day you want your therapist to see it.',
            style: TextStyle(
              fontSize: 12,
              height: 1.35,
              color: AppColors.charcoalInk.withValues(alpha: 0.55),
            ),
          ),
          const SizedBox(height: 10),
          if (entriesAsync.isLoading && entries.isEmpty)
            const Center(child: Padding(
              padding: EdgeInsets.all(16),
              child: CircularProgressIndicator(),
            ))
          else if (entries.isEmpty)
            const Text(
              'No check-ins yet.',
              key: Key('mood_entries_empty'),
              style: TextStyle(fontSize: 13, color: AppColors.inkSoft),
            )
          else
            for (final entry in entries) ...[
              _MoodEntryTile(
                entry: entry,
                onSharedChanged: (value) => _setShared(entry, value),
              ),
              const SizedBox(height: 8),
            ],
        ],
      ),
    );
  }
}

class _MoodEntryTile extends StatelessWidget {
  const _MoodEntryTile({required this.entry, required this.onSharedChanged});

  final MoodEntry entry;
  final ValueChanged<bool> onSharedChanged;

  static const List<String> _months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  static const List<String> _weekdays = [
    'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
  ];

  String get _dateLabel {
    final date = DateTime.tryParse('${entry.date}T00:00:00.000Z');
    if (date == null) return entry.date;
    return '${_weekdays[date.weekday - 1]}, ${date.day} ${_months[date.month - 1]}';
  }

  @override
  Widget build(BuildContext context) {
    final words = [...entry.words, if (entry.other != null) entry.other!];

    return Container(
      key: Key('mood_entry_${entry.id}'),
      padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
      decoration: BoxDecoration(
        color: AppColors.oatElevated,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.hairline),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          MoodFace(value: entry.moodValue, size: 36),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${entry.label ?? ''} · $_dateLabel',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.charcoalInk,
                  ),
                ),
                if (words.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    words.join(', '),
                    style: const TextStyle(fontSize: 13, color: AppColors.inkSoft),
                  ),
                ],
                if (entry.strength != null) ...[
                  const SizedBox(height: 3),
                  Text(
                    'Strength ${entry.strength} of $kStrengthMax',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.charcoalInk.withValues(alpha: 0.5),
                    ),
                  ),
                ],
                const SizedBox(height: 6),
                ShareLabel(shared: entry.shared),
              ],
            ),
          ),
          Switch(
            key: Key('mood_share_${entry.id}'),
            value: entry.shared,
            onChanged: onSharedChanged,
          ),
        ],
      ),
    );
  }
}
