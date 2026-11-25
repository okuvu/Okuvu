import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../theme/app_colors.dart';
import 'exposure_ladder_api.dart';
import 'library_error_message.dart';

/// The exact line the owner approved for a before-rating of 80 or more.
///
/// The api sends the same sentence in `pauseMessage`; this constant is here so
/// the pause appears the moment the client's own number crosses 80, even if the
/// write that records it has not answered yet. Nothing is softened and nothing
/// tells the client they failed.
const exposurePauseLine =
    'This step feels like a lot right now. Take a moment with your breathing first. '
    'You can pause here and bring this step to your next session — waiting is not failing, '
    'and the step will still be here.';

/// The exposure ladder, as the client meets it.
///
/// There is no list of their own here and no filtering: the api answers with the
/// steps the therapist has unlocked and 404s every other step, so what arrives
/// is what may be shown. The screen asks again each time it opens — nothing is
/// cached — because a step unlocked in session today should be there tonight.
///
/// The two numbers are the client's at two moments. They are shown back as
/// chosen and never subtracted, averaged, graded or turned into a level; a lower
/// "after" is not a win and a higher one is not a failure. At 80 or more before
/// the step, the app offers the pause and the existing grounding exercise, and
/// the step stays exactly where the therapist put it.
class ExposureLadderScreen extends ConsumerStatefulWidget {
  const ExposureLadderScreen({super.key});

  @override
  ConsumerState<ExposureLadderScreen> createState() =>
      _ExposureLadderScreenState();
}

enum _Stage { list, before, after, pause, done }

class _ExposureLadderScreenState extends ConsumerState<ExposureLadderScreen> {
  bool _loading = true;
  bool _busy = false;
  String? _loadError;
  List<ExposureStep> _steps = const [];
  ExposureStep? _step;
  _Stage _stage = _Stage.list;
  int _before = 50;
  int _after = 50;
  String? _pauseMessage;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final steps = await ref.read(exposureLadderApiProvider).steps();
      if (!mounted) return;
      setState(() {
        _steps = steps;
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

  void _open(ExposureStep step) {
    setState(() {
      _step = step;
      _stage = _Stage.before;
      _before = 50;
      _after = 50;
      _pauseMessage = null;
    });
  }

  void _backToList() {
    setState(() {
      _stage = _Stage.list;
      _step = null;
      _pauseMessage = null;
    });
    // A run may have changed the step's last rating; ask again rather than
    // drawing the ladder from the copy fetched when the screen opened.
    _load();
  }

  Future<void> _submitBefore() async {
    final step = _step;
    if (step == null) return;

    if (_before >= 80) {
      // The client's own number is enough to pause. The write records it, but
      // the pause does not wait for the network.
      setState(() {
        _stage = _Stage.pause;
        _busy = true;
      });
      try {
        final result = await ref
            .read(exposureLadderApiProvider)
            .run(step.id, before: _before);
        if (!mounted) return;
        setState(() {
          _busy = false;
          _pauseMessage = result.pauseMessage;
        });
      } catch (error) {
        if (!mounted) return;
        setState(() => _busy = false);
        _showError(error);
      }
      return;
    }

    setState(() => _stage = _Stage.after);
  }

  Future<void> _submitAfter() async {
    final step = _step;
    if (step == null || _busy) return;
    setState(() => _busy = true);
    try {
      final result = await ref.read(exposureLadderApiProvider).run(
            step.id,
            before: _before,
            after: _after,
          );
      if (!mounted) return;
      setState(() {
        _busy = false;
        if (result.pause) {
          _pauseMessage = result.pauseMessage;
          _stage = _Stage.pause;
        } else {
          _stage = _Stage.done;
        }
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = false);
      _showError(error);
    }
  }

  void _showError(Object error) {
    final message = serverErrorMessage(error);
    if (message == null) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final onList = _stage == _Stage.list;

    return PopScope(
      // Back inside a step returns to the unlocked steps; it does not leave the
      // ladder in the middle of an attempt.
      canPop: onList,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && !onList) _backToList();
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(LucideIcons.arrowLeft),
            onPressed: onList
                ? () => Navigator.of(context).maybePop()
                : _backToList,
          ),
          title: const Text('Exposure ladder'),
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : _stage == _Stage.list
                ? _listBody(theme)
                : _stepBody(theme),
      ),
    );
  }

  Widget _listBody(ThemeData theme) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        Text(
          'Your therapist builds this ladder with you, in session. Each step is '
          'added together, and unlocked when you are both ready for it.',
          style: theme.textTheme.bodyMedium?.copyWith(height: 1.5),
        ),
        const SizedBox(height: 12),
        Text(
          'You will see only the steps that have been unlocked for you. For each '
          'one, rate how difficult it feels before you try it, and again '
          'afterwards. If a step feels like too much on the day, it can wait.',
          style: theme.textTheme.bodyMedium?.copyWith(
            height: 1.5,
            color: AppColors.inkSoft,
          ),
        ),
        if (_loadError != null) ...[
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
        ],
        const SizedBox(height: 20),
        for (final step in _steps) ...[
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.oatElevated,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.lavenderTint),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  step.label,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    height: 1.35,
                    color: AppColors.charcoalInk,
                  ),
                ),
                const SizedBox(height: 12),
                FilledButton(
                  key: Key('exposure_step_${step.id}'),
                  onPressed: () => _open(step),
                  child: const Text('Continue'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],
      ],
    );
  }

  Widget _stepBody(ThemeData theme) {
    final step = _step;
    if (step == null) return const SizedBox.shrink();

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        Text(
          step.label,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w600,
            color: AppColors.charcoalInk,
          ),
        ),
        const SizedBox(height: 20),
        if (_stage == _Stage.before) ...[
          _rating(
            key: const Key('exposure_before_slider'),
            prompt: 'Before you try this step, how difficult does it feel?',
            value: _before,
            onChanged: (next) => setState(() => _before = next),
          ),
          const SizedBox(height: 20),
          FilledButton(
            key: const Key('exposure_before_continue'),
            onPressed: _submitBefore,
            child: const Text('Continue'),
          ),
        ] else if (_stage == _Stage.after) ...[
          _rating(
            key: const Key('exposure_after_slider'),
            prompt: 'And afterwards?',
            value: _after,
            onChanged: (next) => setState(() => _after = next),
          ),
          const SizedBox(height: 20),
          FilledButton(
            key: const Key('exposure_after_finish'),
            onPressed: _busy ? null : _submitAfter,
            child: _busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Finish'),
          ),
        ] else if (_stage == _Stage.pause) ...[
          Text(
            _pauseMessage ?? exposurePauseLine,
            style: const TextStyle(
              fontSize: 16,
              height: 1.55,
              color: AppColors.charcoalInk,
            ),
          ),
          if (_busy) ...[
            const SizedBox(height: 12),
            const Center(
              child: SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          ],
          const SizedBox(height: 24),
          FilledButton(
            key: const Key('exposure_grounding'),
            onPressed: () => context.push('/library/grounding'),
            child: const Text('Try grounding'),
          ),
          const SizedBox(height: 8),
          TextButton(
            key: const Key('exposure_back_to_ladder'),
            onPressed: _backToList,
            child: const Text('Back to the ladder'),
          ),
        ] else if (_stage == _Stage.done) ...[
          Text(
            'Each step is yours to take when you are ready.',
            style: theme.textTheme.bodyMedium?.copyWith(
              height: 1.5,
              color: AppColors.charcoalInk,
            ),
          ),
          const SizedBox(height: 24),
          FilledButton(
            key: const Key('exposure_done'),
            onPressed: _backToList,
            child: const Text('Done'),
          ),
        ],
      ],
    );
  }

  Widget _rating({
    required Key key,
    required String prompt,
    required int value,
    required ValueChanged<int> onChanged,
  }) {
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
        const SizedBox(height: 8),
        Center(
          child: Text(
            '$value',
            style: const TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w700,
              color: AppColors.charcoalInk,
            ),
          ),
        ),
        Slider(
          key: key,
          value: value.toDouble(),
          min: 0,
          max: 100,
          divisions: 100,
          label: '$value',
          onChanged: (next) => onChanged(next.round()),
        ),
        const Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('0 = not difficult', style: TextStyle(fontSize: 12)),
            Text(
              '100 = as difficult as it gets',
              style: TextStyle(fontSize: 12),
            ),
          ],
        ),
      ],
    );
  }
}
