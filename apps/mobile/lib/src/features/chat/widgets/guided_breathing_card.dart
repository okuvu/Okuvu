import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/providers.dart';
import '../models/tool_card_config.dart';
import '../models/breathing_session.dart';
import '../../../theme/app_colors.dart';
import '../../home/breathing_content.dart';
import 'box_breathing_visual.dart';

/// One breathing exercise, played as three rounds of ten breaths.
///
/// Owner round 2 (4 Nov 2026) rewrote this card around three defects the owner
/// reported from the handset:
///
/// 1. *The count and the shape disagreed.* Phase timing ticked every 900 ms
///    while the circle animated over `seconds` seconds, so a 4-second inhale
///    counted to 4 in 3.6 s and the shape was still growing when the number
///    reset. Both now come off one duration: the number shown is the seconds
///    left in the phase, the animation runs exactly that long, and the number
///    changes on the same frame the shape starts moving.
/// 2. *"Done. How do you feel now?" appeared on exercises nobody had started.*
///    The card kept `complete` in its State while the parent rebuilt it with a
///    different exercise, so a technique switched into mid-session inherited
///    the previous one's ending. The state now lives in [BreathSession] and
///    [didUpdateWidget] resets it whenever the exercise changes.
/// 3. *The exercise ran its preset's cycle count and then stopped for good.*
///    It now runs ten breaths, pauses to ask how the client feels, offers
///    Continue or Stop for now, and ends the sitting by itself after the third
///    round (30 breaths) with a recommendation to take a break.
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
  final double from;
  final double to;

  /// Edge index for [BoxBreathingVisual]: 0 inhale, 1 hold, 2 exhale,
  /// 3 second hold.
  final int boxPhase;

  const _Phase(this.label, this.seconds, this.from, this.to, this.boxPhase);
}

class _GuidedBreathingCardState extends ConsumerState<GuidedBreathingCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;
  final FlutterTts _tts = FlutterTts();
  final BreathSession _session = BreathSession();
  final TextEditingController _feeling = TextEditingController();

  /// Bumped whenever a running loop must abandon ship (stop, restart, a new
  /// exercise, dispose). Every await inside the loop re-checks it: a `mounted`
  /// check alone lets a stale loop keep counting after the client stopped.
  int _runId = 0;

  /// The one-second wait between counts, held so [._halt] can cancel it. A
  /// bare `Future.delayed` cannot be cancelled, so a stopped session would
  /// leave a live timer behind it — visible in the app as a count that lands
  /// after the screen changed, and in tests as a pending timer at teardown.
  Timer? _tickTimer;
  Completer<void>? _tickDone;

  String _phaseLabel = 'Ready';
  int _secondsLeft = 0;
  int _boxPhase = 0;
  bool _running = false;

  Tween<double> _scaleTween = Tween<double>(begin: _minScale, end: _minScale);

  static const _teal = AppColors.violet;
  static const _lteal = AppColors.sageTint;
  static const double _minScale = 0.45;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(vsync: this, duration: widget.tick);
    unawaited(_configureVoice());
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
      _resetToReady();
    }
  }

  @override
  void dispose() {
    _runId += 1;
    _cancelTick();
    _pulse.dispose();
    _feeling.dispose();
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
        holdSeconds: 2,
        exhaleSeconds: 6,
        cycles: 3,
        label: 'Breathing Exercise',
      );

  /// The breath broken into phases, with the shape's scale at each end.
  List<_Phase> get _phases {
    final cfg = _cfg;
    final secondInhale = cfg.secondInhaleSeconds ?? 0;
    final secondHold = cfg.secondHoldSeconds ?? 0;
    final phases = <_Phase>[];
    if (secondInhale > 0) {
      phases.add(_Phase('Breathe in', cfg.inhaleSeconds, _minScale, 0.72, 0));
      phases.add(_Phase('Breathe in again', secondInhale, 0.72, 1.0, 0));
    } else {
      phases.add(_Phase('Breathe in', cfg.inhaleSeconds, _minScale, 1.0, 0));
    }
    if (cfg.holdSeconds > 0) {
      phases.add(_Phase('Hold', cfg.holdSeconds, 1.0, 1.0, 1));
    }
    phases.add(_Phase('Breathe out', cfg.exhaleSeconds, 1.0, _minScale, 2));
    if (secondHold > 0) {
      phases.add(_Phase('Hold', secondHold, _minScale, _minScale, 3));
    }
    return phases;
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
    for (final phase in _phases) {
      if (!_isCurrent(runId) || !_session.isActive) return;
      await _runPhase(phase, runId);
    }
  }

  Future<void> _runPhase(_Phase phase, int runId) async {
    _say(phase.label);
    _scaleTween = Tween<double>(begin: phase.from, end: phase.to);
    setState(() {
      _phaseLabel = phase.label;
      _boxPhase = phase.boxPhase;
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

  void _resetToReady() {
    _session.restart();
    _feeling.clear();
    _halt();
  }

  void _continue() {
    _session.continueSession();
    setState(() {});
    unawaited(_runSitting());
  }

  @override
  Widget build(BuildContext context) {
    final cfg = _cfg;
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
              child: Text(cfg.label,
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
            _visual(isBox: cfg.isBoxVisual),
            const SizedBox(height: 10),
            Text(
              _session.isActive ? _phaseLabel : 'Ten breaths, then a pause',
              style: TextStyle(color: _teal.withValues(alpha: 0.75), fontSize: 13),
            ),
            if (_session.isActive) ...[
              const SizedBox(height: 4),
              Text(_session.breathLabel,
                  style: TextStyle(
                      color: _teal.withValues(alpha: 0.55), fontSize: 12)),
            ],
            const SizedBox(height: 10),
            Text(_timingLine(cfg),
                style: TextStyle(color: _teal.withValues(alpha: 0.5), fontSize: 12)),
          ],
          if (stage == BreathSessionStage.paused) _pauseBlock(),
          if (stage == BreathSessionStage.finished) ...[
            const Icon(LucideIcons.checkCircle, color: _teal, size: 40),
            const SizedBox(height: 8),
            const Text(breathFinishedHeadline,
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: _teal, fontWeight: FontWeight.w600, fontSize: 15)),
            const SizedBox(height: 6),
            Text(breathFinishedBody,
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: _teal.withValues(alpha: 0.8), fontSize: 13)),
          ],
          if (stage == BreathSessionStage.stopped) ...[
            const Icon(LucideIcons.pauseCircle, color: _teal, size: 40),
            const SizedBox(height: 8),
            Text(breathStoppedHeadline(_session.breathsAtStop),
                textAlign: TextAlign.center,
                style: const TextStyle(
                    color: _teal, fontWeight: FontWeight.w600, fontSize: 15)),
            const SizedBox(height: 6),
            Text('Come back whenever you like.',
                style: TextStyle(
                    color: _teal.withValues(alpha: 0.8), fontSize: 13)),
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
              onPressed: _resetToReady,
              child: Text('Start again',
                  style: TextStyle(color: _teal.withValues(alpha: 0.6))),
            ),
        ],
      ),
    );
  }

  String _timingLine(BreathingConfig cfg) =>
      '${cfg.inhaleSeconds}'
      '${(cfg.secondInhaleSeconds ?? 0) > 0 ? '+${cfg.secondInhaleSeconds}' : ''}'
      '${cfg.holdSeconds > 0 ? '-${cfg.holdSeconds}' : ''}'
      '-${cfg.exhaleSeconds}'
      '${(cfg.secondHoldSeconds ?? 0) > 0 ? '-${cfg.secondHoldSeconds}' : ''}';

  Widget _visual({required bool isBox}) {
    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, _) {
        final value = _pulse.value.clamp(0.0, 1.0);
        final scale = _scaleTween.transform(value);
        if (isBox) {
          return Stack(
            alignment: Alignment.center,
            children: [
              BoxBreathingVisual(
                phase: _boxPhase,
                progress: value,
                color: _teal,
                trackColor: _teal.withValues(alpha: 0.2),
              ),
              if (_session.isActive) _ring(120, scale),
            ],
          );
        }
        return _ring(160, scale);
      },
    );
  }

  Widget _ring(double size, double scale) {
    return SizedBox(
      width: size,
      height: size,
      child: Center(
        child: Container(
          width: size * scale,
          height: size * scale,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: _teal.withValues(alpha: 0.15),
            border: Border.all(color: _teal, width: 2),
          ),
          child: Center(
            child: _secondsLeft > 0
                ? Text('$_secondsLeft',
                    style: const TextStyle(
                        color: _teal,
                        fontSize: 28,
                        fontWeight: FontWeight.w300))
                : const SizedBox.shrink(),
          ),
        ),
      ),
    );
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
        const SizedBox(height: 4),
        Text('${_session.totalBreaths} breaths so far.',
            style: TextStyle(color: _teal.withValues(alpha: 0.8), fontSize: 13)),
        const SizedBox(height: 10),
        TextField(
          key: const Key('breathing_feeling_field'),
          controller: _feeling,
          maxLines: 3,
          minLines: 2,
          decoration: InputDecoration(
            hintText: breathPauseHint,
            filled: true,
            fillColor: Colors.white.withValues(alpha: 0.6),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: _teal.withValues(alpha: 0.2)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: _teal.withValues(alpha: 0.2)),
            ),
          ),
        ),
        const SizedBox(height: 12),
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
}
