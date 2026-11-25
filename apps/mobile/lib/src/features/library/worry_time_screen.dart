import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/providers.dart';
import '../../theme/app_colors.dart';
import 'library_api.dart';
import 'library_error_message.dart';
import 'worry_time_api.dart';

/// Worry time, as the client meets it.
///
/// The daily window and the parked list are server state (`/worry-time`), not a
/// form that is mailed in at the end: a worry parked at 11am is there at 7pm
/// even if the app was closed in between. The review is a second view of the
/// same list, where each worry gets one of the two answers the owner approved
/// and then the worksheet's closing reflection.
///
/// Every sentence on this screen is the owner's: the prompts, the helpers, the
/// two review choices and the closing line come from the worksheet body
/// (`packages/shared-types/worksheets/anxiety-worry.ts`). The only words added
/// here are control labels ("Pick a time", "Park a worry", "Done"), and a failed
/// request shows the api's own sentence rather than a second wording.
///
/// Nothing is counted. The list is not "2 of 5", the review is not a score, and
/// a worry that is still bothering the client is not a failure.
class WorryTimeScreen extends ConsumerStatefulWidget {
  const WorryTimeScreen({super.key, this.toolId = 'ws_worry_time'});

  /// The worksheet whose closing reflection is saved. Fixed for this screen, but
  /// named so a test can hand it a different row without a second copy of the
  /// page.
  final String toolId;

  @override
  ConsumerState<WorryTimeScreen> createState() => _WorryTimeScreenState();
}

class _WorryTimeScreenState extends ConsumerState<WorryTimeScreen> {
  final _worryController = TextEditingController();
  final _reflectionController = TextEditingController();

  bool _loading = true;
  bool _savingSettings = false;
  bool _adding = false;
  bool _reviewing = false;
  bool _finishing = false;
  String? _loadError;
  String? _pendingReviewId;
  WorryTimeSetting? _setting;
  List<ParkedWorry> _parked = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _worryController.dispose();
    _reflectionController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final state = await ref.read(worryTimeApiProvider).load();
      if (!mounted) return;
      setState(() {
        _setting = state.setting;
        _parked = state.parked;
        _loading = false;
        _loadError = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadError = serverErrorMessage(error);
      });
    }
  }

  Future<void> _saveSettings({String? time, int? minutes, bool? active}) async {
    final previous = _setting;
    final nextTime = time ?? previous?.time;
    if (nextTime == null || nextTime.isEmpty) return;

    final next = WorryTimeSetting(
      time: nextTime,
      minutes: minutes ?? previous?.minutes ?? 10,
      active: active ?? previous?.active ?? true,
    );
    if (next.time == previous?.time &&
        next.minutes == previous?.minutes &&
        next.active == previous?.active) {
      return;
    }

    setState(() {
      _setting = next;
      _savingSettings = true;
    });
    try {
      final saved = await ref.read(worryTimeApiProvider).saveSettings(
            time: next.time,
            minutes: next.minutes,
            active: next.active,
          );
      if (!mounted) return;
      setState(() {
        _setting = saved;
        _savingSettings = false;
      });
    } catch (error) {
      if (!mounted) return;
      // The api refused the change: put the old window back, so the screen
      // never shows a time that was not saved.
      setState(() {
        _setting = previous;
        _savingSettings = false;
      });
      _showError(error);
    }
  }

  Future<void> _pickTime() async {
    final initial = _parseTime(_setting?.time) ?? const TimeOfDay(hour: 19, minute: 0);
    final picked = await showTimePicker(context: context, initialTime: initial);
    if (picked == null) return;
    final formatted =
        '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
    await _saveSettings(time: formatted);
  }

  static TimeOfDay? _parseTime(String? value) {
    if (value == null) return null;
    final parts = value.split(':');
    if (parts.length != 2) return null;
    final hour = int.tryParse(parts[0]);
    final minute = int.tryParse(parts[1]);
    if (hour == null || minute == null) return null;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return TimeOfDay(hour: hour, minute: minute);
  }

  Future<void> _addWorry() async {
    final text = _worryController.text.trim();
    if (text.isEmpty || _adding) return;

    setState(() => _adding = true);
    try {
      final created = await ref.read(worryTimeApiProvider).park(text);
      if (!mounted) return;
      setState(() {
        _parked = [
          ..._parked,
          ParkedWorry(id: created.id, text: text),
        ];
        _adding = false;
      });
      _worryController.clear();
      if (created.showHelp) {
        ref.read(crisisOverlayProvider.notifier).show();
      } else if (created.helpOffer) {
        _showHelpOffer();
      }
    } catch (error) {
      if (!mounted) return;
      setState(() => _adding = false);
      _showError(error);
    }
  }

  Future<void> _removeWorry(ParkedWorry worry) async {
    try {
      await ref.read(worryTimeApiProvider).remove(worry.id);
      if (!mounted) return;
      setState(() {
        _parked = _parked.where((row) => row.id != worry.id).toList();
      });
    } catch (error) {
      if (!mounted) return;
      _showError(error);
    }
  }

  Future<void> _resolve(ParkedWorry worry, String status) async {
    if (_pendingReviewId != null) return;
    setState(() => _pendingReviewId = worry.id);
    try {
      await ref.read(worryTimeApiProvider).resolve(worry.id, status);
      if (!mounted) return;
      setState(() {
        _parked = _parked.where((row) => row.id != worry.id).toList();
        _pendingReviewId = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _pendingReviewId = null);
      _showError(error);
    }
  }

  /// The review ends on the worksheet's closing reflection. Its words are the
  /// client's own, so they take the one path that screens client text: the
  /// worksheet submit the runner already uses. There is no worry-time route for
  /// it, and writing a second unscreened write path for one optional line would
  /// be worse than reusing the existing one.
  Future<void> _finishReview() async {
    final text = _reflectionController.text.trim();
    setState(() => _finishing = true);
    if (text.isNotEmpty) {
      try {
        final result = await ref.read(libraryApiProvider).submit(
              widget.toolId,
              answers: {'noticed': text},
            );
        if (!mounted) return;
        if (result.showHelp) {
          ref.read(crisisOverlayProvider.notifier).show();
        } else if (result.helpOffer) {
          _showHelpOffer();
        }
      } catch (error) {
        if (!mounted) return;
        setState(() => _finishing = false);
        _showError(error);
        return;
      }
    }
    if (!mounted) return;
    setState(() {
      _finishing = false;
      _reviewing = false;
      _reflectionController.clear();
    });
  }

  void _showError(Object error) {
    final message = serverErrorMessage(error);
    if (message == null) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  void _showHelpOffer() {
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

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return PopScope(
      // Back from the review returns to the daily window; it does not throw the
      // client out of the screen mid-review.
      canPop: !_reviewing,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _reviewing) setState(() => _reviewing = false);
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(LucideIcons.arrowLeft),
            onPressed: () {
              if (_reviewing) {
                setState(() => _reviewing = false);
              } else {
                Navigator.of(context).maybePop();
              }
            },
          ),
          title: const Text('Worry time'),
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : _reviewing
                ? _reviewBody(theme)
                : _mainBody(theme),
      ),
    );
  }

  Widget _mainBody(ThemeData theme) {
    final setting = _setting;
    final canEdit = setting != null;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        Text(
          "Worrying has a way of spreading across the whole day. Giving it one "
          "time and one place doesn't make it disappear — it gives it somewhere "
          "to wait.",
          style: theme.textTheme.bodyMedium?.copyWith(height: 1.5),
        ),
        if (_loadError != null) ..._loadFailed(),
        const SizedBox(height: 24),
        _Prompt(
          prompt: 'What time each day do you want to give it?',
          helper:
              "Pick a time when you can usually stop for a bit. It doesn't have "
              'to be perfect, and you can move it later.',
          child: Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              key: const Key('worry_time_pick_time'),
              icon: const Icon(LucideIcons.clock, size: 16),
              label: Text(setting?.time ?? 'Pick a time'),
              onPressed: _savingSettings ? null : _pickTime,
            ),
          ),
        ),
        const SizedBox(height: 24),
        _Prompt(
          prompt: 'How long do you want?',
          helper:
              'A shorter window is easier to keep. You can always finish early.',
          child: Wrap(
            spacing: 8,
            children: [
              for (final minutes in const [10, 15, 20])
                ChoiceChip(
                  key: Key('worry_time_minutes_$minutes'),
                  label: Text('$minutes minutes'),
                  selected: setting?.minutes == minutes,
                  onSelected: canEdit && !_savingSettings
                      ? (_) => _saveSettings(minutes: minutes)
                      : null,
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SwitchListTile(
          key: const Key('worry_time_pause'),
          contentPadding: EdgeInsets.zero,
          title: const Text(
            'Pause',
            style: TextStyle(fontSize: 16, color: AppColors.charcoalInk),
          ),
          value: setting == null ? false : !setting.active,
          onChanged: canEdit && !_savingSettings
              ? (paused) => _saveSettings(active: !paused)
              : null,
        ),
        const SizedBox(height: 8),
        const Divider(color: AppColors.hairline),
        const SizedBox(height: 16),
        const _Prompt(
          prompt: "What's parked for that time?",
          helper:
              'During the day, when a worry turns up, put it here instead of '
              'carrying it round. When your worry time comes, come back and look '
              'at each one.',
        ),
        if (_parked.isNotEmpty) ...[
          const SizedBox(height: 4),
          for (final worry in _parked)
            _ParkedTile(
              key: Key('parked_worry_${worry.id}'),
              text: worry.text,
              removeKey: Key('remove_worry_${worry.id}'),
              onRemove: () => _removeWorry(worry),
            ),
        ],
        const SizedBox(height: 12),
        TextField(
          key: const Key('worry_time_add_field'),
          controller: _worryController,
          minLines: 1,
          maxLines: 3,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(
            labelText: 'The worry',
            border: OutlineInputBorder(),
            isDense: true,
          ),
        ),
        const SizedBox(height: 10),
        Align(
          alignment: Alignment.centerLeft,
          child: FilledButton(
            key: const Key('worry_time_park'),
            onPressed: _adding ? null : _addWorry,
            child: _adding
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Park a worry'),
          ),
        ),
        if (_parked.isNotEmpty) ...[
          const SizedBox(height: 24),
          FilledButton.tonal(
            key: const Key('worry_time_review'),
            onPressed: () => setState(() => _reviewing = true),
            child: const Text('When you came back to it'),
          ),
        ],
      ],
    );
  }

  List<Widget> _loadFailed() {
    return [
      const SizedBox(height: 16),
      Text(
        _loadError!,
        style: const TextStyle(color: AppColors.charcoalInk, height: 1.5),
      ),
      const SizedBox(height: 8),
      TextButton(
        onPressed: () {
          setState(() => _loading = true);
          _load();
        },
        child: const Text('Try again'),
      ),
    ];
  }

  Widget _reviewBody(ThemeData theme) {
    final remaining = _parked;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        Text(
          'When you came back to it',
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w600,
            color: AppColors.charcoalInk,
          ),
        ),
        const SizedBox(height: 16),
        for (final worry in remaining) ...[
          _ReviewTile(
            key: Key('review_worry_${worry.id}'),
            text: worry.text,
            busy: _pendingReviewId == worry.id,
            onStill: () => _resolve(worry, 'still'),
            onReleased: () => _resolve(worry, 'released'),
          ),
          const SizedBox(height: 12),
        ],
        if (remaining.isEmpty) ...[
          const SizedBox(height: 4),
          _Prompt(
            prompt: 'What do you notice about the ones you parked?',
            helper: 'Optional. A word is enough.',
            child: TextField(
              key: const Key('worry_time_reflection'),
              controller: _reflectionController,
              minLines: 1,
              maxLines: 4,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
          ),
          const SizedBox(height: 24),
          Text(
            "A worry kept for later is a worry you're not carrying all day.",
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium?.copyWith(
              height: 1.5,
              color: AppColors.charcoalInk,
            ),
          ),
          const SizedBox(height: 20),
          FilledButton(
            key: const Key('worry_time_review_done'),
            onPressed: _finishing ? null : _finishReview,
            child: _finishing
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Done'),
          ),
        ],
      ],
    );
  }
}

class _Prompt extends StatelessWidget {
  const _Prompt({
    required this.prompt,
    required this.helper,
    this.child,
  });

  final String prompt;
  final String helper;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          prompt,
          style: const TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w600,
            color: AppColors.charcoalInk,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          helper,
          style: TextStyle(
            fontSize: 13,
            height: 1.45,
            color: AppColors.charcoalInk.withValues(alpha: 0.6),
          ),
        ),
        if (child != null) ...[
          const SizedBox(height: 12),
          child!,
        ],
      ],
    );
  }
}

class _ParkedTile extends StatelessWidget {
  const _ParkedTile({
    super.key,
    required this.text,
    required this.removeKey,
    required this.onRemove,
  });

  final String text;
  final Key removeKey;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(14, 10, 4, 10),
      decoration: BoxDecoration(
        color: AppColors.oatElevated,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.lavenderTint),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                fontSize: 15,
                height: 1.4,
                color: AppColors.charcoalInk,
              ),
            ),
          ),
          IconButton(
            key: removeKey,
            visualDensity: VisualDensity.compact,
            tooltip: 'Remove',
            icon: const Icon(LucideIcons.x, size: 18),
            onPressed: onRemove,
          ),
        ],
      ),
    );
  }
}

class _ReviewTile extends StatelessWidget {
  const _ReviewTile({
    super.key,
    required this.text,
    required this.busy,
    required this.onStill,
    required this.onReleased,
  });

  final String text;
  final bool busy;
  final VoidCallback onStill;
  final VoidCallback onReleased;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.oatElevated,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.lavenderTint),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            text,
            style: const TextStyle(
              fontSize: 16,
              height: 1.4,
              color: AppColors.charcoalInk,
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  key: Key('still_$text'),
                  onPressed: busy ? null : onStill,
                  child: const Text('Still bothering me'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton(
                  key: Key('released_$text'),
                  onPressed: busy ? null : onReleased,
                  child: const Text('Not anymore'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
