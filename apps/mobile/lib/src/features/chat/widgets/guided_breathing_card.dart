import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/providers.dart';
import '../models/tool_card_config.dart';
import '../models/breathing_session.dart';
import '../../../theme/app_colors.dart';
import '../../home/breathing_content.dart';
import 'breathing_visuals.dart';

/// One breathing exercise, played as three rounds and paused between them.
///
/// Owner round 2 (4 Nov 2026) came in three passes: the two handset defects
/// (a count on a different clock from the shape; an ending inherited by an
/// exercise nobody had started), then Dr Goswami's approved changes of 3 Nov —
/// four clearly different techniques, one pace each, a per-technique visual,
/// five breaths a round for the sigh, three taps instead of a text box, and a
/// rest at the end rather than a hard wall.
///
/// Both defects were the same shape of bug: state outliving its context. The
/// count ticked every 900 ms while the circle animated over the full phase, and
/// the card kept `complete` while the parent swapped the exercise underneath
/// it. Now every number on screen is the time actually left in the phase, the
/// shape animates over exactly that long, and [didUpdateWidget] throws the
/// sitting away when the technique changes.
///
/// [tick] exists so tests can run thirty breaths in milliseconds. Every
/// duration on screen is a multiple of it; the app always uses one second.
class GuidedBreathingCard extends ConsumerStatefulWidget {
  final ToolCardConfig config;
  final Duration tick;

  const GuidedBreathingCard({
    required this.config,
    this.tick = const Duration(seconds: 1),
    super.key,
  });

  @override
  ConsumerState<GuidedBreathingCard> createState() => _GuidedBreathingCardState();
}

/// One phase inside a single breath.
class _Phase {
  final String label;
  final int seconds;

  /// Lung posture at the start and end of the phase, 0..1. The visual reads it
  /// as `fill`; the box uses only the phase index.
  final double from;
  final double to;

  const _Phase(this.label, this.seconds, this.from, this.to);
}

class _GuidedBreathingCardState extends ConsumerState<GuidedBreathingCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;
  final FlutterTts _tts = FlutterTts();

  /// Rebuilt in [didUpdateWidget] when the exercise changes: a `late final`
  /// here would keep the first technique's round length and visual for every
  /// later exercise in the same slot — the same class of bug as the ending
  /// that appeared on an exercise nobody had started.
  late BreathingTechnique? _technique;
  late BreathSession _session;

  BreathFeeling? _feeling;

  /// Bumped whenever a running loop must abandon ship (stop, restart, a new
  /// exercise, dispose). Every await inside the loop re-checks it: a `mounted`
  /// check alone lets a stale loop keep counting after the client stopped.
  int _runId = 0;

  /// The one-second wait between counts, held so [._halt] can cancel it. A
  /// bare `Future.delayed` cannot be cancelled, so a stopped session would
  /// leave a live timer behind it.
  Timer? _tickTimer;
  Completer<void>? _tickDone;

  String _phaseLabel = 'Ready';
  int _secondsLeft = 0;
  int _phaseIndex = 0;
  bool _running = false;

  Tween<double> _fillTween = Tween<double>(begin: 0.15, end: 0.15);

  static const _teal = AppColors.violet;
  static const _lteal = AppColors.sageTint;

  BreathVisual get _visual => _technique?.visual ?? BreathVisual.swell;
  bool get _showsNumbers => _technique?.showsNumbers ?? true;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(vsync: this, duration: widget.tick);
    _bindTechnique();
    unawaited(_configureVoice());
  }

  void _bindTechnique() {
    _technique = breathingTechniqueFor(widget.config.type.jsonValue);
    _session = BreathSession(breathsPerRound: _technique?.breathsPerRound ?? 10);
  }

  Future<void> _configureVoice() async {
    try {
      await _tts.setLanguage('en-IN');
      await _tts.setSpeechRate(0.4);
      await _tts.setVolume(1.0);
    } catch (_) {
      // No TTS engine (or no plugin in a test harness): stay silent.
    }
  }

  @override
  void didUpdateWidget(covariant GuidedBreathingCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.config.type != widget.config.type) {
      // A different exercise now occupies this slot. Nothing from the previous
      // sitting may carry over — that is what made an ending appear on an
      // exercise the client had not even started.
      _bindTechnique();
      _feeling = null;
      _halt();
    }
  }

  @override
  void dispose() {
    _runId += 1;
    _cancelTick();
    _pulse.dispose();
    unawaited(_tts.stop().catchError((Object _) => 0));
    super.dispose();
  }

  bool get _voiceEnabled {
    try {
      return ref.read(voiceSettingsStateProvider).voiceEnabled;
    } catch (_) {
      return false;
    }
  }

  void _say(String text) {
    if (!_voiceEnabled) return;
    // Never awaited: a slow TTS engine must not stretch a phase, which is
    // exactly how the count and the shape drifted apart before.
    unawaited(_tts.speak(text).catchError((Object _) => 0));
  }

  BreathingConfig get _cfg =>
      widget.config.breathingConfig ??
      const BreathingConfig(
        inhaleSeconds: 4,
        holdSeconds: 0,
        exhaleSeconds: 8,
        cycles: 1,
        label: 'Breathing Exercise',
      );

  /// The breath broken into phases, shaped by the technique's own visual.
  List<_Phase> get _phases {
    final cfg = _cfg;
    final secondInhale = cfg.secondInhaleSeconds ?? 0;
    switch (_visual) {
      case BreathVisual.box:
        return [
          _Phase('Breathe in', cfg.inhaleSeconds, 0.45, 1.0),
          if (cfg.holdSeconds > 0) _Phase('Hold', cfg.holdSeconds, 1.0, 1.0),
          _Phase('Breathe out', cfg.exhaleSeconds, 1.0, 0.45),
          if ((cfg.secondHoldSeconds ?? 0) > 0)
            _Phase('Hold', cfg.secondHoldSeconds!, 0.45, 0.45),
        ];
      case BreathVisual.swell:
        return [
          _Phase('Fill your lungs… in', cfg.inhaleSeconds, 0.15, 0.62),
          if (secondInhale > 0) _Phase('and a little more', secondInhale, 0.62, 1.0),
          _Phase('now breathe out', cfg.exhaleSeconds, 1.0, 0.15),
        ];
      case BreathVisual.ripples:
        return [
          _Phase('Breathe in', cfg.inhaleSeconds, 0.2, 0.9),
          _Phase('Hum out', cfg.exhaleSeconds, 0.9, 0.2),
        ];
      case BreathVisual.wave:
        return [
          _Phase('Breathe in', cfg.inhaleSeconds, 0.15, 1.0),
          if (cfg.holdSeconds > 0) _Phase('Hold', cfg.holdSeconds, 1.0, 1.0),
          _Phase('Breathe out', cfg.exhaleSeconds, 1.0, 0.15),
        ];
    }
  }

  Future<void> _start() async {
    if (_running) return;
    _session.start();
    setState(() {});
    await _runSitting();
  }

  Future<void> _runSitting() async {
    final runId = ++_runId;
    setState(() => _running = true);
    try {
      while (_session.isActive) {
        await _runBreath(runId);
        if (!_isCurrent(runId) || !_session.isActive) return;
        _session.completeBreath();
        setState(() {});
      }
    } finally {
      if (_isCurrent(runId)) {
        setState(() {
          _running = false;
          _secondsLeft = 0;
          _phaseLabel = 'Ready';
        });
      }
    }
  }

  Future<void> _runBreath(int runId) async {
    final phases = _phases;
    for (var i = 0; i < phases.length; i++) {
      if (!_isCurrent(runId) || !_session.isActive) return;
      await _runPhase(phases[i], i, phases.length, runId);
    }
  }

  Future<void> _runPhase(_Phase phase, int index, int count, int runId) async {
    _say(phase.label);
    _fillTween = Tween<double>(begin: phase.from, end: phase.to);
    setState(() {
      _phaseLabel = phase.label;
      _phaseIndex = index;
      _secondsLeft = phase.seconds;
    });
    _pulse.duration = widget.tick * phase.seconds;
    _pulse.forward(from: 0);

    // The countdown and the shape share this loop's clock; tick is one second
    // in the app, so the number on screen is the seconds actually left in the
    // phase and the shape settles on the frame the phase ends.
    for (var elapsed = 1; elapsed <= phase.seconds; elapsed++) {
      if (!_isCurrent(runId)) return;
      await _waitTick();
      if (!_isCurrent(runId)) return;
      setState(() => _secondsLeft = phase.seconds - elapsed);
    }
  }

  Future<void> _waitTick() {
    final done = Completer<void>();
    _tickDone = done;
    _tickTimer?.cancel();
    _tickTimer = Timer(widget.tick, () {
      if (!done.isCompleted) done.complete();
    });
    return done.future;
  }

  void _cancelTick() {
    _tickTimer?.cancel();
    _tickTimer = null;
    final done = _tickDone;
    _tickDone = null;
    if (done != null && !done.isCompleted) done.complete();
  }

  bool _isCurrent(int runId) => mounted && runId == _runId;

  void _halt() {
    _runId += 1;
    _pulse.stop();
    _cancelTick();
    unawaited(_tts.stop().catchError((Object _) => 0));
    setState(() {
      _running = false;
      _secondsLeft = 0;
      _phaseLabel = 'Ready';
    });
  }

  void _stop() {
    _session.stop();
    _halt();
  }

  void _restart() {
    _session.restart();
    _feeling = null;
    _halt();
  }

  void _continue() {
    _session.continueSession();
    _feeling = null;
    setState(() {});
    unawaited(_runSitting());
  }

  void _openChat() {
    context.push('/chat');
  }

  void _openHelplines() {
    ref.read(crisisOverlayProvider.notifier).show();
  }

  @override
  Widget build(BuildContext context) {
    final stage = _session.stage;
    final showingBreath =
        stage == BreathSessionStage.active || stage == BreathSessionStage.ready;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: _lteal,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _teal.withValues(alpha: 0.2)),
      ),
      child: Column(
        children: [
          Row(children: [
            const Icon(LucideIcons.wind, color: _teal, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(_cfg.label,
                  style: const TextStyle(
                      color: _teal, fontWeight: FontWeight.w600, fontSize: 15)),
            ),
            if (_session.isActive)
              Text(_session.roundLabel,
                  style: TextStyle(
                      color: _teal.withValues(alpha: 0.6), fontSize: 13)),
          ]),
          const SizedBox(height: 16),
          if (showingBreath) ...[
            _visualAndCount(),
            const SizedBox(height: 10),
            Text(
              _session.isActive
                  ? _phaseLabel
                  : '${_session.breathsPerRound} breaths, then a pause',
              textAlign: TextAlign.center,
              style: TextStyle(
                  color: _teal.withValues(alpha: 0.85),
                  fontSize: _showsNumbers ? 13 : 16,
                  fontWeight: _showsNumbers ? FontWeight.w400 : FontWeight.w500),
            ),
            if (_session.isActive) ...[
              const SizedBox(height: 4),
              Text(_session.breathLabel,
                  style: TextStyle(
                      color: _teal.withValues(alpha: 0.55), fontSize: 12)),
            ],
            if (_showsNumbers) ...[
              const SizedBox(height: 6),
              Text(_timingLine(_cfg),
                  style: TextStyle(
                      color: _teal.withValues(alpha: 0.45), fontSize: 12)),
            ],
          ],
          if (stage == BreathSessionStage.paused) _pauseBlock(),
          if (stage == BreathSessionStage.finished) ..._finishedBlock(),
          if (stage == BreathSessionStage.stopped) ...[
            const Icon(LucideIcons.pauseCircle, color: _teal, size: 40),
            const SizedBox(height: 8),
            Text(breathStoppedCopy,
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: _teal.withValues(alpha: 0.85), fontSize: 14)),
          ],
          const SizedBox(height: 16),
          if (stage == BreathSessionStage.ready)
            FilledButton(
              key: const Key('breathing_start_button'),
              onPressed: _start,
              style: FilledButton.styleFrom(backgroundColor: _teal),
              child: const Text('Start'),
            ),
          if (_session.isActive)
            TextButton(
              key: const Key('breathing_stop_button'),
              onPressed: _stop,
              child: Text('Stop',
                  style: TextStyle(color: _teal.withValues(alpha: 0.6))),
            ),
          if (stage == BreathSessionStage.finished ||
              stage == BreathSessionStage.stopped)
            TextButton(
              key: const Key('breathing_restart_button'),
              onPressed: _restart,
              child: Text('Start again',
                  style: TextStyle(color: _teal.withValues(alpha: 0.6))),
            ),
        ],
      ),
    );
  }

  Widget _visualAndCount() {
    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, _) {
        final value = _pulse.value.clamp(0.0, 1.0);
        final fill = _fillTween.transform(value);
        final phases = _phases.length;
        return Stack(
          alignment: Alignment.center,
          children: [
            BreathingVisual(
              kind: _visual,
              phaseIndex: _phaseIndex,
              phaseCount: phases,
              progress: value,
              fill: fill,
              color: _teal,
              trackColor: _teal.withValues(alpha: 0.18),
              size: 200,
            ),
            if (_session.isActive && _showsNumbers && _secondsLeft > 0)
              Text('$_secondsLeft',
                  style: const TextStyle(
                      color: _teal,
                      fontSize: 30,
                      fontWeight: FontWeight.w300)),
          ],
        );
      },
    );
  }

  /// "4-4-4-4", "4-8", "4-6" — the pace line for the techniques that show
  /// numbers. The sigh shows words instead, so this is never drawn for it.
  String _timingLine(BreathingConfig cfg) =>
      '${cfg.inhaleSeconds}'
      '${(cfg.secondInhaleSeconds ?? 0) > 0 ? '+${cfg.secondInhaleSeconds}' : ''}'
      '${cfg.holdSeconds > 0 ? '-${cfg.holdSeconds}' : ''}'
      '-${cfg.exhaleSeconds}'
      '${(cfg.secondHoldSeconds ?? 0) > 0 ? '-${cfg.secondHoldSeconds}' : ''}';

  List<Widget> _finishedBlock() {
    return [
      const Icon(LucideIcons.sunrise, color: _teal, size: 40),
      const SizedBox(height: 8),
      Text(breathFinishedHeadline(_session.totalPlanned),
          textAlign: TextAlign.center,
          style: const TextStyle(
              color: _teal, fontWeight: FontWeight.w600, fontSize: 15)),
      const SizedBox(height: 6),
      Text(breathBreakBody,
          textAlign: TextAlign.center,
          style: TextStyle(color: _teal.withValues(alpha: 0.8), fontSize: 13)),
      const SizedBox(height: 14),
      FilledButton(
        key: const Key('breathing_done_button'),
        onPressed: _restart,
        style: FilledButton.styleFrom(
            backgroundColor: _teal, minimumSize: const Size.fromHeight(46)),
        child: const Text(breathDoneLabel),
      ),
      const SizedBox(height: 4),
      TextButton(
        key: const Key('breathing_talk_button'),
        onPressed: _openChat,
        child: Text(breathTalkLabel,
            style: TextStyle(color: _teal.withValues(alpha: 0.75))),
      ),
    ];
  }

  Widget _pauseBlock() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(LucideIcons.pauseCircle, color: _teal, size: 36),
        const SizedBox(height: 8),
        const Text(breathPauseQuestion,
            style: TextStyle(
                color: _teal, fontWeight: FontWeight.w600, fontSize: 15)),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: _feelingTap(BreathFeeling.calmer, breathCalmerLabel)),
          const SizedBox(width: 8),
          Expanded(child: _feelingTap(BreathFeeling.same, breathSameLabel)),
          const SizedBox(width: 8),
          Expanded(child: _feelingTap(BreathFeeling.worse, breathWorseLabel)),
        ]),
        if (_feeling == BreathFeeling.worse) ...[
          const SizedBox(height: 12),
          Text(breathWorseCopy,
              style: TextStyle(color: _teal.withValues(alpha: 0.9), fontSize: 13)),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(
              child: OutlinedButton(
                key: const Key('breathing_talk_okuva_button'),
                onPressed: _openChat,
                style: OutlinedButton.styleFrom(
                  foregroundColor: _teal,
                  side: BorderSide(color: _teal.withValues(alpha: 0.5)),
                ),
                child: const Text(breathTalkLabel),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton(
                key: const Key('breathing_helplines_button'),
                onPressed: _openHelplines,
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.crisis,
                  side: BorderSide(color: AppColors.crisis.withValues(alpha: 0.5)),
                ),
                child: const Text('Helplines'),
              ),
            ),
          ]),
        ],
        const SizedBox(height: 14),
        Row(children: [
          Expanded(
            child: FilledButton(
              key: const Key('breathing_continue_button'),
              onPressed: _continue,
              style: FilledButton.styleFrom(backgroundColor: _teal),
              child: const Text(breathContinueLabel),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: OutlinedButton(
              key: const Key('breathing_stop_for_now_button'),
              onPressed: _stop,
              style: OutlinedButton.styleFrom(
                foregroundColor: _teal,
                side: BorderSide(color: _teal.withValues(alpha: 0.4)),
              ),
              child: const Text(breathStopLabel),
            ),
          ),
        ]),
      ],
    );
  }

  Widget _feelingTap(BreathFeeling feeling, String label) {
    final selected = _feeling == feeling;
    return OutlinedButton(
      key: Key('breathing_feeling_${feeling.name}'),
      onPressed: () => setState(() => _feeling = feeling),
      style: OutlinedButton.styleFrom(
        foregroundColor: _teal,
        backgroundColor: selected ? _teal.withValues(alpha: 0.12) : null,
        side: BorderSide(
            color: _teal.withValues(alpha: selected ? 0.8 : 0.3),
            width: selected ? 2 : 1),
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 12),
      ),
      child: Text(label,
          textAlign: TextAlign.center, style: const TextStyle(fontSize: 12)),
    );
  }
}
