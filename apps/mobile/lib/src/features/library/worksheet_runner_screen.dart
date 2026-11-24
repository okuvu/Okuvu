import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/providers.dart';
import '../../core/speech_service.dart';
import '../../theme/app_colors.dart';
import 'worksheet_draft_store.dart';
import 'library_api.dart';
import 'worksheet_spec.dart';

/// One worksheet, one piece per screen.
///
/// The screen holds no copy of its own: every question, helper line, example
/// and button label comes from the worksheet body, which comes from the
/// approved document. What this file owns is behaviour — the step order, the
/// branching, the progress bar, the required-piece gate, dictation, and the
/// draft that survives a closed app.
///
/// Deliberately absent: any score, any instrument name, any judgement of what
/// the client wrote. The demanding-worksheet gate (feeling above 5/10 sends the
/// client to grounding instead) belongs to the Library entry point, not here —
/// this screen assumes the client is allowed to be in it.
/// What the client reported around the worksheet itself.
///
/// All four are optional by design — the owner's rule is that the client "can
/// rate how they feel before and after if they want to", so every one of these
/// has a skip, and a skipped answer is stored as null rather than as a zero.
class WorksheetOutcome {
  const WorksheetOutcome({
    this.feelingBefore,
    this.feelingAfter,
    this.didIt,
    this.barriers,
    this.helped,
  });

  /// 0-10, "How strong is what you're feeling right now?" — the gate answer when
  /// the worksheet is demanding, otherwise whatever the client chose to give.
  final int? feelingBefore;

  /// 0-10, "How are you feeling now?"
  final int? feelingAfter;

  /// Assigned worksheets only: did the client get to it?
  final bool? didIt;

  /// Assigned worksheets only, when they did not: "What got in the way?"
  final String? barriers;

  /// The one-tap "This helped". Null means the client did not answer.
  final bool? helped;
}

class WorksheetRunnerScreen extends ConsumerStatefulWidget {
  const WorksheetRunnerScreen({
    super.key,
    required this.toolId,
    required this.userId,
    required this.content,
    this.personalNote,
    this.draftStore,
    this.speech,
    this.onFinished,
    this.onSaveToTreasureBox,
    this.feelingBefore,
    this.isAssigned = false,
  });

  final String toolId;
  final String userId;
  final WorksheetContent content;

  /// The rating the client already gave at the demanding-worksheet gate. When
  /// it is here the "before" question is not asked again — asking twice is how
  /// two different numbers end up stored for one exercise.
  final int? feelingBefore;

  /// True when this worksheet came from a therapist's assignment, which is what
  /// adds the "Did you do it?" / "What got in the way?" question.
  final bool isAssigned;

  /// "Save to my Treasure Box" — only called when the approved closing copy has
  /// that button. Returns false when the save failed, so the screen can say so
  /// instead of silently dropping what the client kept.
  final Future<bool> Function()? onSaveToTreasureBox;

  /// The therapist's personal line (Homework.personal_note), shown under the
  /// piece that reserved space for it.
  final String? personalNote;

  /// Injectable for tests; production uses the shared-preferences store.
  final WorksheetDraftStore? draftStore;

  /// Injectable for tests; production resolves the platform recogniser.
  final SpeechService? speech;

  /// Called when the client finishes. The caller decides what happens to the
  /// answers (safety-checked save). Null in previews.
  ///
  /// Async because the save is a network write the api safety-checks: the
  /// runner waits for it so a failed save can keep the draft instead of
  /// clearing it and losing what the client wrote.
  final Future<void> Function(WorksheetAnswers answers, WorksheetOutcome outcome)?
      onFinished;

  @override
  ConsumerState<WorksheetRunnerScreen> createState() => _WorksheetRunnerState();
}

class _WorksheetRunnerState extends ConsumerState<WorksheetRunnerScreen> {
  late final WorksheetDraftStore _drafts = widget.draftStore ?? WorksheetDraftStore();
  late SpeechService _speech;

  WorksheetAnswers _answers = {};
  int _stepIndex = 0;
  bool _finished = false;

  /// Step 5 — the optional self-report around the pieces themselves.
  int? _feelingBefore;
  int? _feelingAfter;
  bool? _didIt;
  String _barriers = '';
  bool? _helped;

  /// Where the client is in the whole flow. "One step per screen" now includes
  /// the two rating questions and, for an assigned worksheet, the did-you-do-it
  /// question — they are screens like any other rather than a form bolted onto
  /// the last piece.
  ///
  /// 'before' | 'pieces' | 'after' | 'did' | 'closing'
  String _stage = 'before';

  /// One "what does this mean?" request at a time.
  bool _helpLoading = false;
  bool _savingToTreasure = false;
  bool _restoring = true;
  bool _isListening = false;

  /// The save is a network write, so it can be in flight — and it can fail.
  /// `_submitting` keeps a second tap from posting twice, and `_saveFailed`
  /// keeps the client on their answers instead of handing them a "Done"
  /// screen over a save that never reached the server.
  bool _submitting = false;
  bool _saveFailed = false;

  /// One controller per text-ish piece (and per row-list cell), created on
  /// first render. Creating them inside build would reset the caret on every
  /// keystroke, which on a phone reads as the keyboard fighting you.
  final Map<String, TextEditingController> _controllers = {};

  TextEditingController _controllerFor(String key, String initial) {
    final existing = _controllers[key];
    if (existing != null) return existing;
    final created = TextEditingController(text: initial)
      ..selection = TextSelection.collapsed(offset: initial.length);
    _controllers[key] = created;
    return created;
  }

  @override
  void dispose() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  List<WorksheetField> get _steps => visibleFields(widget.content, _answers);

  @override
  void initState() {
    super.initState();
    _speech = widget.speech ?? ref.read(speechServiceProvider);
    // A demanding worksheet already asked the question at the Library card, and
    // that answer is the client's "before". Asking again here would store a
    // second, possibly different, number for the same moment.
    _feelingBefore = widget.feelingBefore;
    _stage = widget.feelingBefore == null ? 'before' : 'pieces';
    _restore();
  }

  Future<void> _restore() async {
    WorksheetDraft? draft;
    try {
      draft = await _drafts.load(widget.userId, widget.toolId);
    } catch (_) {
      // A draft that cannot be read is a start-from-the-beginning, never a
      // reason to open the worksheet and sit on a spinner: `_restoring` false
      // is the screen, and this is the only path that sets it.
      draft = null;
    }
    if (!mounted) return;
    setState(() {
      if (draft != null) {
        _answers = draft.answers;
        _stepIndex = draft.stepIndex;
        // Anything already written means the flow has moved past the opening
        // question, whether or not a rating was given.
        _stage = 'pieces';
      }
      _restoring = false;
    });
  }

  Future<void> _persist() async {
    await _drafts.save(
      widget.userId,
      widget.toolId,
      WorksheetDraft(answers: _answers, stepIndex: _stepIndex, updatedAt: DateTime.now()),
    );
  }

  void _setAnswer(String id, Object? value) {
    setState(() {
      if (value == null || (value is String && value.trim().isEmpty)) {
        _answers.remove(id);
      } else {
        _answers[id] = value;
      }
      // A branch can disappear when its trigger changes; keep the pointer in
      // range rather than showing an empty screen.
      final last = _steps.length - 1;
      if (_stepIndex > last) _stepIndex = last < 0 ? 0 : last;
    });
    _persist();
  }

  void _goTo(int index) {
    setState(() => _stepIndex = index);
    _persist();
  }

  Future<void> _askForHelp(WorksheetField field) async {
    setState(() => _helpLoading = true);
    final text = await ref.read(libraryApiProvider).help(widget.toolId, field.id);
    if (!mounted) return;
    setState(() => _helpLoading = false);

    // Nothing to say. The step is already on screen, so the right thing to do
    // is nothing at all — no error, no apology, no "help isn't available" (the
    // owner's rule, 10 Nov 2026: that wording is one more broken thing landing
    // on someone who is already struggling). The api sends the step's own
    // approved helper line whenever it has one, so this branch is only the case
    // where the step has no helper of its own.
    if (text == null) return;

    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.oatElevated,
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                field.prompt,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppColors.charcoalInk,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                text,
                style: const TextStyle(
                  fontSize: 15,
                  height: 1.5,
                  color: AppColors.charcoalInk,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _goToAfter() {
    setState(() => _stage = 'after');
    _persist();
  }

  void _goToWrap() {
    setState(() => _stage = 'wrap');
    _persist();
  }

  /// Hand everything to the caller, which stores it. The screen then shows the
  /// closing line and the approved buttons.
  ///
  /// The draft is deliberately NOT cleared here: the answers are only safe once
  /// the caller has stored them, and the caller clears it (see WorksheetScreen).
  Future<void> _submit() async {
    if (_submitting) return;
    setState(() {
      _submitting = true;
      _saveFailed = false;
    });

    try {
      await widget.onFinished?.call(
        Map<String, Object?>.from(_answers),
        WorksheetOutcome(
          feelingBefore: _feelingBefore,
          feelingAfter: _feelingAfter,
          didIt: widget.isAssigned ? _didIt : null,
          // Only an assigned worksheet asks, and only when the client said they
          // did not get to it — a barrier paragraph attached to a finished
          // worksheet is noise on a therapist's dashboard.
          barriers: widget.isAssigned && _didIt == false && _barriers.trim().isNotEmpty
              ? _barriers.trim()
              : null,
          helped: _helped,
        ),
      );
    } catch (_) {
      // Not stored. The answers and the draft stay exactly where they are and
      // the client is told, because the alternative — the closing screen over a
      // save that never happened — is a silent loss with a false confirmation.
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _saveFailed = true;
      });
      return;
    }

    if (!mounted) return;
    setState(() {
      _submitting = false;
      _finished = true;
      _stage = 'closing';
    });
    // Working through a worksheet to its closing line is one act of use — and
    // only once it is actually stored, so a save that failed does not count.
    ref.read(becomingJourneyProvider.notifier).recordMoment();
  }

  Future<void> _toggleListening() async {
    if (_isListening) {
      await _speech.stop();
      if (mounted) setState(() => _isListening = false);
      return;
    }

    // SpeechService asks for the microphone itself and reports why it could
    // not start, so there is one place that decides what a refusal means.
    if (mounted) setState(() => _isListening = true);
    final outcome = await _speech.start(
      onWords: (words, isFinal) {
        if (!mounted) return;
        final steps = _steps;
        final index = _stepIndex < 0 ? 0 : (_stepIndex >= steps.length ? steps.length - 1 : _stepIndex);
        final field = steps[index];
        // Only the words ever reach the field. The recogniser transcribes on
        // the handset; no audio is stored, and nothing here uploads sound.
        _controllerFor(field.id, '').text = words;
        _setAnswer(field.id, words);
      },
      onEnded: () {
        if (mounted) setState(() => _isListening = false);
      },
    );

    if (!mounted || outcome == SpeechStartOutcome.listening) return;

    setState(() => _isListening = false);
    final message = switch (outcome) {
      SpeechStartOutcome.permissionDenied => 'Microphone access is needed to talk instead of type.',
      SpeechStartOutcome.permissionBlocked =>
        'Microphone access is turned off for OKUVU. You can turn it on in your phone settings.',
      SpeechStartOutcome.unavailable => 'Talking instead of typing is not available on this phone.',
      _ => 'Could not start listening. You can type instead.',
    };
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (_restoring) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (_finished) return _buildClosing(theme);
    if (_stage == 'before') return _buildBefore(theme);
    if (_stage == 'after') return _buildAfter(theme);
    if (_stage == 'wrap') return _buildWrap(theme);
    return _buildPieceScreen(theme);
  }

  /// One piece, one screen.
  Widget _buildPieceScreen(ThemeData theme) {
    final steps = _steps;
    if (steps.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Worksheet')),
        body: const Center(child: Text('This worksheet is not ready yet.')),
      );
    }

    final rawIndex = _stepIndex < 0 ? 0 : _stepIndex;
    final index = rawIndex >= steps.length ? steps.length - 1 : rawIndex;
    final field = steps[index];
    final progress = worksheetProgress(widget.content, _answers);

    return Scaffold(
      appBar: AppBar(
        title: Text('${index + 1} of ${steps.length}'),
        leading: IconButton(
          icon: const Icon(LucideIcons.x),
          tooltip: 'Close',
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            LinearProgressIndicator(
              value: steps.length <= 1 ? 1 : index / steps.length,
              minHeight: 6,
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (index == 0 && widget.content.intro != null) ...[
                      Text(
                        widget.content.intro!,
                        style: theme.textTheme.bodyMedium?.copyWith(height: 1.5),
                      ),
                      const SizedBox(height: 20),
                    ],
                    // The approved privacy line, on the worksheet itself: what
                    // is written here is not shared unless the client chooses
                    // to share it, and the safety pass notices danger without
                    // revealing the words.
                    if (index == 0) ...[
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(LucideIcons.lock, size: 16),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                "Your therapist can't read this unless you choose to share it. "
                                "If OKUVU's safety system notices you may be in danger, it will show "
                                "you help straight away and let your therapist know you may need "
                                "support, without sharing what you wrote.",
                                style: theme.textTheme.bodySmall,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),
                    ],
                    Text(field.prompt, style: theme.textTheme.titleMedium),
                    if (field.helper != null) ...[
                      const SizedBox(height: 6),
                      Text(
                        field.helper!,
                        style: theme.textTheme.bodySmall?.copyWith(height: 1.4),
                      ),
                    ],
                    if (field.example != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        'Example: ${field.example}',
                        style: theme.textTheme.bodySmall?.copyWith(fontStyle: FontStyle.italic),
                      ),
                    ],
                    // The only AI help a worksheet offers: explain the step,
                    // encourage, ask an open question. It never sees the
                    // answers and never writes them — and the api refuses any
                    // reply that breaks those rules, so a null here means "say
                    // nothing", not "improvise a line".
                    if (field.type != 'instruction')
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton(
                          key: const Key('worksheetHelpButton'),
                          onPressed: _helpLoading ? null : () => _askForHelp(field),
                          child: Text(_helpLoading ? 'Loading…' : 'What does this mean?'),
                        ),
                      ),
                    const SizedBox(height: 16),
                    _buildInput(field, theme),
                    if (field.therapistNote && (widget.personalNote?.isNotEmpty ?? false)) ...[
                      const SizedBox(height: 16),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Your therapist’s note',
                              style: theme.textTheme.labelSmall,
                            ),
                            const SizedBox(height: 4),
                            Text(widget.personalNote!, style: theme.textTheme.bodyMedium),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 24),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: Text(
                '${progress.answered} of ${progress.total} answered',
                style: theme.textTheme.bodySmall,
                textAlign: TextAlign.center,
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: Row(
                children: [
                  if (index > 0)
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => _goTo(index - 1),
                        child: const Text('Back'),
                      ),
                    ),
                  if (index > 0) const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: FilledButton(
                      onPressed: canAdvanceFrom(field, _answers)
                          ? () => index >= steps.length - 1
                              ? _goToAfter()
                              : _goTo(index + 1)
                          : null,
                      child: Text(index >= steps.length - 1 ? 'Finish' : 'Next'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// The optional "before" rating.
  ///
  /// Wording is the owner's approved gate question and scale, so the number
  /// stored here means the same thing as the number the demanding-worksheet
  /// gate reads. Skippable: the owner's rule is that the client can rate "if
  /// they want to", and a rating someone felt obliged to give is not a rating.
  Widget _buildBefore(ThemeData theme) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.content.fields.isEmpty ? 'Worksheet' : 'Before you start'),
        leading: IconButton(
          icon: const Icon(LucideIcons.x),
          tooltip: 'Close',
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                "How strong is what you're feeling right now?",
                style: theme.textTheme.titleMedium,
              ),
              const SizedBox(height: 16),
              _ratingSlider(
                key: const Key('worksheet_feeling_before'),
                value: _feelingBefore,
                onChanged: (value) => setState(() => _feelingBefore = value),
              ),
              const Spacer(),
              FilledButton(
                key: const Key('worksheet_before_continue'),
                onPressed: () {
                  setState(() => _stage = 'pieces');
                  _persist();
                },
                child: const Text('Next'),
              ),
              TextButton(
                key: const Key('worksheet_before_skip'),
                onPressed: () {
                  setState(() => _stage = 'pieces');
                  _persist();
                },
                child: const Text('Skip'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// The optional "after" rating. The approved copy is the same slider the
  /// grounding and breathing screens use.
  Widget _buildAfter(ThemeData theme) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Almost done'),
        leading: IconButton(
          icon: const Icon(LucideIcons.x),
          tooltip: 'Close',
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('How are you feeling now?', style: theme.textTheme.titleMedium),
              const SizedBox(height: 16),
              _ratingSlider(
                key: const Key('worksheet_feeling_after'),
                value: _feelingAfter,
                onChanged: (value) => setState(() => _feelingAfter = value),
              ),
              const Spacer(),
              FilledButton(
                key: const Key('worksheet_after_continue'),
                onPressed: _goToWrap,
                child: const Text('Next'),
              ),
              TextButton(
                key: const Key('worksheet_after_skip'),
                onPressed: _goToWrap,
                child: const Text('Skip'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// The last screen before the closing line: "Did you do it?" for an assigned
  /// worksheet, what got in the way when the answer is no, and the one-tap
  /// "This helped".
  ///
  /// The questions' wording is the approved document's own ("Did you do it?",
  /// "What got in the way?", "No judgement. This helps you and your therapist
  /// plan better."). Nothing here is composed.
  Widget _buildWrap(ThemeData theme) {
    final showBarriers = widget.isAssigned && _didIt == false;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Almost done'),
        leading: IconButton(
          icon: const Icon(LucideIcons.x),
          tooltip: 'Close',
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (widget.isAssigned) ...[
                Text('Did you do it?', style: theme.textTheme.titleMedium),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        key: const Key('worksheet_did_it_yes'),
                        onPressed: () => setState(() {
                          _didIt = true;
                          _barriers = '';
                        }),
                        child: const Text('Yes'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: OutlinedButton(
                        key: const Key('worksheet_did_it_no'),
                        onPressed: () => setState(() => _didIt = false),
                        child: const Text('Not this time'),
                      ),
                    ),
                  ],
                ),
                if (showBarriers) ...[
                  const SizedBox(height: 20),
                  Text('What got in the way?', style: theme.textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Text(
                    'No judgement. This helps you and your therapist plan better.',
                    style: theme.textTheme.bodySmall?.copyWith(height: 1.4),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    key: const Key('worksheet_barriers'),
                    maxLines: 3,
                    onChanged: (text) => setState(() => _barriers = text),
                    decoration: const InputDecoration(
                      border: OutlineInputBorder(),
                      hintText: 'Short answer, optional',
                    ),
                  ),
                ],
                const SizedBox(height: 24),
              ],
              Text('This helped', style: theme.textTheme.titleMedium),
              const SizedBox(height: 8),
              // One tap, and no "no" to press: a client who does not want to
              // answer simply taps Finish.
              Align(
                alignment: Alignment.centerLeft,
                child: ChoiceChip(
                  key: const Key('worksheet_this_helped'),
                  label: const Text('This helped'),
                  selected: _helped == true,
                  onSelected: (selected) =>
                      setState(() => _helped = selected ? true : null),
                ),
              ),
              const SizedBox(height: 28),
              if (_saveFailed) ...[
                Text(
                  "Couldn't save that just now. Your answers are still here — try again when you have signal.",
                  key: const Key('worksheet_save_failed'),
                  style: theme.textTheme.bodyMedium?.copyWith(
                    height: 1.4,
                    color: theme.colorScheme.error,
                  ),
                ),
                const SizedBox(height: 12),
              ],
              FilledButton(
                key: const Key('worksheet_finish'),
                onPressed: _submitting ? null : _submit,
                child: _submitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(_saveFailed ? 'Try again' : 'Finish'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// The approved 0-10 slider, with the owner's endpoint labels.
  Widget _ratingSlider({
    required Key key,
    required int? value,
    required ValueChanged<int> onChanged,
  }) {
    return Column(
      children: [
        Text(
          '${value ?? 5}',
          style: const TextStyle(
            fontSize: 26,
            fontWeight: FontWeight.w700,
            color: AppColors.charcoalInk,
          ),
        ),
        Slider(
          key: key,
          value: (value ?? 5).toDouble(),
          min: 0,
          max: 10,
          divisions: 10,
          label: '${value ?? 5}',
          onChanged: (next) => onChanged(next.round()),
        ),
        const Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('0 = barely there', style: TextStyle(fontSize: 12)),
            Text("10 = the strongest I've felt", style: TextStyle(fontSize: 12)),
          ],
        ),
      ],
    );
  }

  Widget _buildClosing(ThemeData theme) {
    final closing = widget.content.closing;
    return Scaffold(
      appBar: AppBar(title: const Text('Done')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (closing?.text != null)
                Text(
                  closing!.text!,
                  style: theme.textTheme.titleMedium?.copyWith(height: 1.5),
                  textAlign: TextAlign.center,
                ),
              const SizedBox(height: 24),
              for (final button in closing?.buttons ?? const <WorksheetClosingButton>[])
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: button.action == 'treasure_box'
                      ? OutlinedButton(
                          key: const Key('worksheet_save_to_treasure'),
                          onPressed: _savingToTreasure
                              ? null
                              : () async {
                                  final save = widget.onSaveToTreasureBox;
                                  if (save == null) return;
                                  setState(() => _savingToTreasure = true);
                                  final saved = await save();
                                  if (!mounted) return;
                                  setState(() => _savingToTreasure = false);
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text(
                                        saved
                                            ? 'Kept in your Treasure Box.'
                                            : "Couldn't save that just now. Try again in a moment.",
                                      ),
                                    ),
                                  );
                                },
                          child: Text(button.label),
                        )
                      : FilledButton(
                          onPressed: () => Navigator.of(context).maybePop(),
                          child: Text(button.label),
                        ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildInput(WorksheetField field, ThemeData theme) {
    final answer = _answers[field.id];

    switch (field.type) {
      case 'instruction':
        return const SizedBox.shrink();

      case 'short_text':
      case 'long_text':
      case 'closing_reflection':
        return _textField(
          field,
          answer,
          maxLines: field.type == 'short_text' ? 2 : 6,
          allowVoice: field.type != 'short_text',
        );

      case 'voice_note':
        return _textField(field, answer, maxLines: 6, allowVoice: true);

      case 'scale_0_10':
      case 'scale_0_100':
        final value = answer is int ? answer : (field.scaleMax == 10 ? 5 : 50);
        return Column(
          children: [
            Text('$value', style: theme.textTheme.headlineSmall),
            Slider(
              value: value.toDouble(),
              min: 0,
              max: field.scaleMax.toDouble(),
              divisions: field.scaleMax,
              label: '$value',
              onChanged: (v) => _setAnswer(field.id, v.round()),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(field.minLabel ?? '0', style: theme.textTheme.bodySmall),
                Text(
                  field.maxLabel ?? (field.scaleMax == 100 ? '100' : '10'),
                  style: theme.textTheme.bodySmall,
                ),
              ],
            ),
          ],
        );

      case 'choice':
        return Column(
          children: [
            for (final option in field.options)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () => _setAnswer(field.id, option.value),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: answer == option.value
                            ? theme.colorScheme.primary
                            : theme.colorScheme.outlineVariant,
                        width: answer == option.value ? 2 : 1,
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(option.label, style: theme.textTheme.bodyMedium),
                        if (option.description != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(
                              option.description!,
                              style: theme.textTheme.bodySmall,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        );

      case 'checklist':
        final picked = answer is List
            ? answer.whereType<String>().toList(growable: false)
            : <String>[];
        final max = field.maxSelections;
        return Column(
          children: [
            for (final option in field.options)
              Builder(builder: (context) {
                final checked = picked.contains(option.value);
                final atLimit = max != null && picked.length >= max;
                return CheckboxListTile(
                  value: checked,
                  onChanged: !checked && atLimit
                      ? null
                      : (value) {
                          final next = [...picked];
                          if (value == true) {
                            next.add(option.value);
                          } else {
                            next.remove(option.value);
                          }
                          _setAnswer(field.id, next.isEmpty ? null : next);
                        },
                  title: Text(option.label),
                  subtitle: option.description == null ? null : Text(option.description!),
                  controlAffinity: ListTileControlAffinity.leading,
                  contentPadding: EdgeInsets.zero,
                );
              }),
          ],
        );

      case 'feelings_picker':
        return _feelingsPicker(field, answer, theme);

      case 'row_list':
        return _rowList(field, answer, theme);

      case 'countdown_timer':
        return _countdownTimer(field, answer, theme);

      case 'body_outline':
        return _bodyOutline(field, answer, theme);

      case 'datetime':
        final raw = answer is String ? answer : '';
        final date = raw.contains('T') ? raw.split('T').first : raw;
        final time = raw.contains('T') ? raw.split('T').last : '';
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (field.withDate)
              OutlinedButton.icon(
                icon: const Icon(LucideIcons.calendar, size: 16),
                label: Text(date.isEmpty ? 'Pick a date' : date),
                onPressed: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: DateTime.now(),
                    firstDate: DateTime.now().subtract(const Duration(days: 1)),
                    lastDate: DateTime.now().add(const Duration(days: 365)),
                  );
                  if (picked == null) return;
                  final iso =
                      '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
                  _setAnswer(field.id, time.isEmpty ? iso : '${iso}T$time');
                },
              ),
            if (field.withTime) ...[
              const SizedBox(height: 8),
              OutlinedButton.icon(
                icon: const Icon(LucideIcons.clock, size: 16),
                label: Text(time.isEmpty ? 'Pick a time' : time),
                onPressed: () async {
                  final picked = await showTimePicker(
                    context: context,
                    initialTime: TimeOfDay.now(),
                  );
                  if (picked == null) return;
                  final formatted =
                      '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
                  final baseDate = date.isEmpty ? _todayIso() : date;
                  _setAnswer(field.id, '${baseDate}T$formatted');
                },
              ),
            ],
          ],
        );

      default:
        return const SizedBox.shrink();
    }
  }

  String _todayIso() {
    final now = DateTime.now();
    return '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
  }

  /// The countdown piece (owner's rule 7, 24 Nov 2026).
  ///
  /// It stores the number of seconds the timer actually ran — the number the
  /// client watched — and nothing else: no score, no pass or fail, and stopping
  /// early is a complete answer unless the piece sets `minSeconds`.
  Widget _countdownTimer(WorksheetField field, Object? answer, ThemeData theme) {
    final total = field.seconds ?? 60;
    final min = field.minSeconds ?? 0;
    return _CountdownTimerPiece(
      key: ValueKey('timer_${field.id}'),
      totalSeconds: total,
      saved: answer is int ? answer : null,
      startLabel: field.startLabel,
      doneLabel: field.doneLabel,
      onRan: (seconds) {
        if (seconds < min) return;
        _setAnswer(field.id, seconds);
      },
      theme: theme,
    );
  }

  /// The body-outline piece (owner's rule 7, 24 Nov 2026).
  ///
  /// The words are the worksheet's (`field.regions`); the drawing is the app's.
  /// A part with no known place on the outline is still tappable — it is shown as
  /// a chip under the drawing — because a part the client cannot reach is a part
  /// they cannot answer with.
  Widget _bodyOutline(WorksheetField field, Object? answer, ThemeData theme) {
    final picked = answer is Map && answer['picked'] is List
        ? (answer['picked'] as List).whereType<String>().toList(growable: false)
        : <String>[];
    final strength = answer is Map && answer['strength'] is Map
        ? Map<String, int>.from(
            (answer['strength'] as Map).map((k, v) => MapEntry(k.toString(), v is int ? v : 5)),
          )
        : <String, int>{};
    final max = field.maxSelections ?? 3;

    void toggle(String id) {
      final next = [...picked];
      if (next.contains(id)) {
        next.remove(id);
        strength.remove(id);
      } else {
        if (next.length >= max) return;
        next.add(id);
      }
      _setAnswer(field.id, next.isEmpty ? null : {'picked': next, 'strength': strength});
    }

    final onBody = field.regions.where((r) => _bodySpotFor(r.id) != null).toList(growable: false);
    final offBody = field.regions.where((r) => _bodySpotFor(r.id) == null).toList(growable: false);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (onBody.isNotEmpty)
          AspectRatio(
            aspectRatio: 0.62,
            child: LayoutBuilder(builder: (context, constraints) {
              final w = constraints.maxWidth;
              final h = constraints.maxHeight;
              return Stack(
                children: [
                  Positioned.fill(
                    child: CustomPaint(
                      painter: _BodySilhouettePainter(
                        line: theme.colorScheme.outlineVariant,
                        fill: theme.colorScheme.surface,
                      ),
                    ),
                  ),
                  for (final region in onBody)
                    Builder(builder: (context) {
                      final spot = _bodySpotFor(region.id)!;
                      return Positioned(
                        left: (spot.$1 * w) - 34,
                        top: (spot.$2 * h) - 14,
                        child: SizedBox(
                          width: 68,
                          child: _BodySpot(
                            label: region.label,
                            selected: picked.contains(region.id),
                            onTap: () => toggle(region.id),
                          ),
                        ),
                      );
                    }),
                ],
              );
            }),
          ),
        if (offBody.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final region in offBody)
                FilterChip(
                  label: Text(region.label),
                  selected: picked.contains(region.id),
                  onSelected: (_) => toggle(region.id),
                ),
            ],
          ),
        ],
        const SizedBox(height: 8),
        Text('$max at most', style: theme.textTheme.bodySmall),
        if (field.withStrength && picked.isNotEmpty) ...[
          const SizedBox(height: 12),
          if (field.strengthPrompt != null)
            Text(field.strengthPrompt!, style: theme.textTheme.bodySmall),
          for (final id in picked) ...[
            Text(
              field.regions.firstWhere((r) => r.id == id).label,
              style: theme.textTheme.bodySmall,
            ),
            Slider(
              value: (strength[id] ?? 5).toDouble(),
              min: 0,
              max: 10,
              divisions: 10,
              label: '${strength[id] ?? 5}',
              onChanged: (v) {
                strength[id] = v.round();
                _setAnswer(field.id, {'picked': picked, 'strength': strength});
              },
            ),
          ],
        ],
      ],
    );
  }

  Widget _textField(
    WorksheetField field,
    Object? answer, {
    required int maxLines,
    required bool allowVoice,
  }) {
    final value = answer is String ? answer : '';
    return TextField(
      key: ValueKey('worksheet_field_${field.id}'),
      controller: _controllerFor(field.id, value),
      maxLines: maxLines,
      maxLength: field.maxLength ?? (field.type == 'short_text' ? 500 : 10000),
      onChanged: (text) => _setAnswer(field.id, text),
      decoration: InputDecoration(
        border: const OutlineInputBorder(),
        counterText: '',
        suffixIcon: allowVoice
            ? IconButton(
                key: ValueKey('worksheet_voice_${field.id}'),
                tooltip: _isListening ? 'Stop' : 'Talk instead of type',
                icon: Icon(_isListening ? LucideIcons.circleDot : LucideIcons.mic),
                onPressed: _toggleListening,
              )
            : null,
      ),
    );
  }

  Widget _feelingsPicker(WorksheetField field, Object? answer, ThemeData theme) {
    final picked = answer is Map && answer['picked'] is List
        ? (answer['picked'] as List).whereType<String>().toList(growable: false)
        : <String>[];
    final strength = answer is Map && answer['strength'] is Map
        ? Map<String, int>.from(
            (answer['strength'] as Map).map((k, v) => MapEntry(k.toString(), v is int ? v : 5)),
          )
        : <String, int>{};
    final max = field.maxSelections ?? 3;
    final families = field.feelings.where((f) => f.parent == null).toList(growable: false);

    void toggle(String id) {
      final next = [...picked];
      if (next.contains(id)) {
        next.remove(id);
        strength.remove(id);
      } else {
        if (next.length >= max) return;
        next.add(id);
      }
      _setAnswer(field.id, next.isEmpty ? null : {'picked': next, 'strength': strength});
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final family in families) ...[
              FilterChip(
                label: Text(family.label),
                selected: picked.contains(family.id),
                onSelected: (_) => toggle(family.id),
              ),
              for (final child in field.feelings.where((f) => f.parent == family.id))
                FilterChip(
                  label: Text(child.label),
                  selected: picked.contains(child.id),
                  onSelected: (_) => toggle(child.id),
                ),
            ],
          ],
        ),
        const SizedBox(height: 8),
        Text('$max at most', style: theme.textTheme.bodySmall),
        if (field.withStrength && picked.isNotEmpty) ...[
          const SizedBox(height: 12),
          for (final id in picked) ...[
            Text(
              field.feelings.firstWhere((f) => f.id == id).label,
              style: theme.textTheme.bodySmall,
            ),
            Slider(
              value: (strength[id] ?? 5).toDouble(),
              min: 0,
              max: 10,
              divisions: 10,
              label: '${strength[id] ?? 5}',
              onChanged: (v) {
                strength[id] = v.round();
                _setAnswer(field.id, {'picked': picked, 'strength': strength});
              },
            ),
          ],
        ],
      ],
    );
  }

  Widget _rowList(WorksheetField field, Object? answer, ThemeData theme) {
    final rows = answer is List
        ? answer.map((r) => r is Map ? Map<String, Object?>.from(r) : <String, Object?>{}).toList()
        : <Map<String, Object?>>[];
    final max = field.maxRows ?? 25;

    void update(List<Map<String, Object?>> next) {
      _setAnswer(field.id, next.isEmpty ? null : next);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < rows.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final column in field.columns) ...[
                  Text(column.label, style: theme.textTheme.bodySmall),
                  if (column.type == 'scale_0_10')
                    Slider(
                      value: (rows[i][column.id] is int ? rows[i][column.id] as int : 5).toDouble(),
                      min: 0,
                      max: 10,
                      divisions: 10,
                      label: '${rows[i][column.id] is int ? rows[i][column.id] : 5}',
                      onChanged: (v) {
                        final next = rows.map((r) => Map<String, Object?>.from(r)).toList();
                        next[i][column.id] = v.round();
                        update(next);
                      },
                    )
                  else if (column.type == 'choice')
                    // One label per row, nothing ranked: the stored value is the
                    // option the client tapped, and only that.
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final option in column.options)
                          ChoiceChip(
                            label: Text(option.label),
                            selected: rows[i][column.id] == option.value,
                            onSelected: (_) {
                              final next = rows.map((r) => Map<String, Object?>.from(r)).toList();
                              next[i][column.id] = option.value;
                              update(next);
                            },
                          ),
                      ],
                    )
                  else
                    TextField(
                      controller: _controllerFor(
                        '${field.id}:$i:${column.id}',
                        '${rows[i][column.id] ?? ''}',
                      ),
                      onChanged: (text) {
                        final next = rows.map((r) => Map<String, Object?>.from(r)).toList();
                        next[i][column.id] = text;
                        update(next);
                      },
                      decoration: InputDecoration(
                        isDense: true,
                        border: const OutlineInputBorder(),
                        hintText: column.type == 'datetime' ? 'YYYY-MM-DD' : null,
                      ),
                    ),
                  const SizedBox(height: 8),
                ],
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => update([
                      for (var j = 0; j < rows.length; j++)
                        if (j != i) Map<String, Object?>.from(rows[j]),
                    ]),
                    child: const Text('Remove'),
                  ),
                ),
              ],
            ),
          ),
        if (rows.length < max)
          OutlinedButton.icon(
            icon: const Icon(LucideIcons.plus, size: 16),
            label: Text(field.addLabel ?? 'Add a row'),
            onPressed: () => update([...rows, <String, Object?>{}]),
          ),
      ],
    );
  }
}


// ─── The two pieces built for the 24 Nov 2026 worksheet rules ─────────────

/// Where a part sits on the drawn outline, as a fraction of the box.
///
/// Only ids the drawing has a place for are listed. A worksheet's own part names
/// are not constrained by this map: anything not here is still offered, as a chip
/// under the drawing, so a copy change can never make a part unreachable.
(double, double)? _bodySpotFor(String id) {
  const spots = <String, (double, double)>{
    'head': (0.50, 0.09),
    'face': (0.50, 0.08),
    'jaw': (0.50, 0.13),
    'neck': (0.50, 0.18),
    'throat': (0.50, 0.19),
    'shoulders': (0.50, 0.24),
    'chest': (0.50, 0.31),
    'heart': (0.44, 0.31),
    'stomach': (0.50, 0.41),
    'belly': (0.50, 0.43),
    'back': (0.50, 0.36),
    'hips': (0.50, 0.50),
    'arms': (0.26, 0.32),
    'hands': (0.16, 0.47),
    'legs': (0.50, 0.68),
    'thighs': (0.43, 0.62),
    'knees': (0.44, 0.74),
    'feet': (0.44, 0.93),
  };
  return spots[id];
}

/// One tappable part on the drawing.
class _BodySpot extends StatelessWidget {
  const _BodySpot({required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        decoration: BoxDecoration(
          color: selected ? theme.colorScheme.primary.withValues(alpha: 0.16) : Colors.transparent,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: selected ? theme.colorScheme.primary : theme.colorScheme.outlineVariant,
            width: selected ? 2 : 1,
          ),
        ),
        child: Text(
          label,
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: theme.textTheme.labelSmall,
        ),
      ),
    );
  }
}

/// A plain outline of a person. Drawn, not an image asset: it has to scale to any
/// phone and it carries no wording, so there is nothing to translate.
class _BodySilhouettePainter extends CustomPainter {
  _BodySilhouettePainter({required this.line, required this.fill});

  final Color line;
  final Color fill;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final stroke = Paint()
      ..color = line
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4;
    final body = Paint()..color = fill;

    Offset at(double x, double y) => Offset(x * w, y * h);

    final head = Rect.fromCircle(center: at(0.50, 0.09), radius: w * 0.11);
    canvas.drawOval(head, body);
    canvas.drawOval(head, stroke);

    final torso = Path()
      ..moveTo(0.50 * w, 0.19 * h)
      ..lineTo(0.34 * w, 0.23 * h)
      ..quadraticBezierTo(0.29 * w, 0.34 * h, 0.33 * w, 0.44 * h)
      ..lineTo(0.38 * w, 0.52 * h)
      ..lineTo(0.62 * w, 0.52 * h)
      ..lineTo(0.67 * w, 0.44 * h)
      ..quadraticBezierTo(0.71 * w, 0.34 * h, 0.66 * w, 0.23 * h)
      ..close();
    canvas.drawPath(torso, body);
    canvas.drawPath(torso, stroke);

    for (final side in [0.34, 0.66]) {
      final drift = side < 0.5 ? -0.10 : 0.10;
      final arm = Path()
        ..moveTo(side * w, 0.24 * h)
        ..quadraticBezierTo((side + drift) * w, 0.36 * h, (side + drift * 0.8) * w, 0.49 * h);
      canvas.drawPath(arm, stroke);
    }

    for (final side in [0.43, 0.57]) {
      final drift = side < 0.5 ? -0.02 : 0.02;
      final leg = Path()
        ..moveTo(side * w, 0.52 * h)
        ..lineTo((side + drift) * w, 0.72 * h)
        ..lineTo((side + drift / 2) * w, 0.92 * h);
      canvas.drawPath(leg, stroke);
    }
  }

  @override
  bool shouldRepaint(covariant _BodySilhouettePainter old) => old.line != line || old.fill != fill;
}

/// A countdown the client starts.
///
/// Its own widget so the tick has somewhere to live that is not the whole
/// worksheet's state: a rebuild of this piece must not re-run the parent's
/// required-piece gate. It reports the seconds that actually elapsed, once, when
/// it stops or finishes.
class _CountdownTimerPiece extends StatefulWidget {
  const _CountdownTimerPiece({
    super.key,
    required this.totalSeconds,
    required this.onRan,
    required this.theme,
    this.saved,
    this.startLabel,
    this.doneLabel,
  });

  final int totalSeconds;
  final int? saved;
  final String? startLabel;
  final String? doneLabel;
  final ValueChanged<int> onRan;
  final ThemeData theme;

  @override
  State<_CountdownTimerPiece> createState() => _CountdownTimerPieceState();
}

class _CountdownTimerPieceState extends State<_CountdownTimerPiece> {
  Timer? _tick;
  int _remaining = 0;
  bool _running = false;

  @override
  void initState() {
    super.initState();
    _remaining = widget.totalSeconds;
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  void _start() {
    _tick?.cancel();
    setState(() {
      _running = true;
      _remaining = widget.totalSeconds;
    });
    _tick = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      if (_remaining <= 1) {
        timer.cancel();
        setState(() {
          _remaining = 0;
          _running = false;
        });
        widget.onRan(widget.totalSeconds);
        return;
      }
      setState(() => _remaining -= 1);
    });
  }

  void _stop() {
    _tick?.cancel();
    final ran = widget.totalSeconds - _remaining;
    setState(() => _running = false);
    if (ran > 0) widget.onRan(ran);
  }

  String _format(int seconds) {
    final m = (seconds ~/ 60).toString().padLeft(2, '0');
    final s = (seconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    final theme = widget.theme;
    final done = widget.saved != null && _remaining == 0 && !_running;
    final label = done ? (widget.doneLabel ?? 'Done') : (widget.startLabel ?? 'Start');

    return Column(
      children: [
        Text(_format(_remaining), style: theme.textTheme.headlineMedium),
        const SizedBox(height: 8),
        FilledButton(
          onPressed: _running ? _stop : _start,
          child: Text(_running ? 'Stop' : label),
        ),
      ],
    );
  }
}
