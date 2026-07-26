import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_tts/flutter_tts.dart';

import '../../../core/providers.dart';
import '../models/tool_card_config.dart';

class GuidedBreathingCard extends ConsumerStatefulWidget {
  final ToolCardConfig config;
  const GuidedBreathingCard({required this.config, super.key});

  @override
  ConsumerState<GuidedBreathingCard> createState() => _GuidedBreathingCardState();
}

class _GuidedBreathingCardState extends ConsumerState<GuidedBreathingCard>
    with TickerProviderStateMixin {

  late AnimationController _circleController;
  late Animation<double> _circleSize;
  final FlutterTts _tts = FlutterTts();

  BreathingPhase _phase = BreathingPhase.ready;
  int _currentCycle = 0;
  int _countDisplay = 0;
  bool _skipped = false;

  static const _teal = Color(0xFF1A6B5A);
  static const _lteal = Color(0xFFE8F5EE);

  @override
  void initState() {
    super.initState();
    _circleController = AnimationController(vsync: this);
    _circleSize = Tween<double>(begin: 80, end: 160).animate(
      CurvedAnimation(parent: _circleController, curve: Curves.easeInOut),
    );
    _tts.setLanguage('en-IN');
    _tts.setSpeechRate(0.4);
    _tts.setVolume(1.0);
  }

  @override
  void dispose() {
    _circleController.dispose();
    _tts.stop();
    super.dispose();
  }

  bool get _voiceEnabled => ref.read(voiceSettingsStateProvider).voiceEnabled;

  BreathingConfig get _cfg =>
      widget.config.breathingConfig ?? const BreathingConfig(
        inhaleSeconds: 4,
        holdSeconds: 2,
        exhaleSeconds: 6,
        cycles: 3,
        label: 'Breathing Exercise',
      );

  Future<void> _startSession() async {
    setState(() => _phase = BreathingPhase.active);
    final cfg = _cfg;

    for (int cycle = 1; cycle <= cfg.cycles; cycle++) {
      if (!mounted || _skipped) break;
      setState(() => _currentCycle = cycle);

      await _speakAndCount('Breathe in', cfg.inhaleSeconds, expanding: true);
      if (!mounted || _skipped) break;

      if (cfg.holdSeconds > 0) {
        await _speakAndCount('Hold', cfg.holdSeconds);
        if (!mounted || _skipped) break;
      }

      await _speakAndCount('Breathe out', cfg.exhaleSeconds, contract: true);
      if (!mounted || _skipped) break;
    }

    if (!_skipped && mounted) {
      if (_voiceEnabled) await _tts.speak('Well done. Take a moment.');
      setState(() => _phase = BreathingPhase.complete);
    }
  }

  Future<void> _speakAndCount(
    String instruction,
    int seconds, {
    bool expanding = false,
    bool contract = false,
  }) async {
    if (_voiceEnabled) await _tts.speak(instruction);
    if (!mounted) return;

    if (expanding) {
      _circleController.duration = Duration(seconds: seconds);
      _circleController.forward();
    } else if (contract) {
      _circleController.duration = Duration(seconds: seconds);
      _circleController.reverse();
    }

    for (int i = 1; i <= seconds; i++) {
      if (!mounted || _skipped) return;
      setState(() => _countDisplay = i);
      if (_voiceEnabled) await _tts.speak('$i');
      await Future.delayed(const Duration(milliseconds: 900));
    }
    if (!mounted) return;
    setState(() => _countDisplay = 0);
  }

  void _skip() {
    setState(() => _skipped = true);
    _tts.stop();
    _circleController.stop();
  }

  @override
  Widget build(BuildContext context) {
    final cfg = _cfg;

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
            const Icon(Icons.air_rounded, color: _teal, size: 18),
            const SizedBox(width: 8),
            Text(cfg.label,
              style: const TextStyle(
                color: _teal, fontWeight: FontWeight.w600, fontSize: 15)),
            const Spacer(),
            if (_phase == BreathingPhase.active)
              Text('$_currentCycle/${cfg.cycles}',
                style: TextStyle(color: _teal.withValues(alpha: 0.6), fontSize: 13)),
          ]),
          const SizedBox(height: 20),
          if (_phase != BreathingPhase.complete) ...[
            AnimatedBuilder(
              animation: _circleSize,
              builder: (context, _) => Container(
                width: _circleSize.value,
                height: _circleSize.value,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: _teal.withValues(alpha: 0.15),
                  border: Border.all(color: _teal, width: 2),
                ),
                child: Center(
                  child: _countDisplay > 0
                    ? Text('$_countDisplay',
                        style: const TextStyle(
                          color: _teal,
                          fontSize: 28,
                          fontWeight: FontWeight.w300))
                    : const SizedBox.shrink(),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              '${cfg.inhaleSeconds}${cfg.holdSeconds > 0 ? '-${cfg.holdSeconds}' : ''}-${cfg.exhaleSeconds}',
              style: TextStyle(color: _teal.withValues(alpha: 0.5), fontSize: 12),
            ),
          ],
          if (_phase == BreathingPhase.complete)
            const Column(children: [
              Icon(Icons.check_circle_outline, color: _teal, size: 40),
              SizedBox(height: 8),
              Text('Done. How do you feel now?',
                style: TextStyle(color: _teal, fontWeight: FontWeight.w500)),
            ]),
          const SizedBox(height: 16),
          if (_phase == BreathingPhase.ready)
            Row(children: [
              Expanded(
                child: FilledButton(
                  onPressed: _startSession,
                  style: FilledButton.styleFrom(backgroundColor: _teal),
                  child: const Text('Start'),
                ),
              ),
              const SizedBox(width: 12),
              TextButton(
                onPressed: _skip,
                child: Text('Skip', style: TextStyle(color: _teal.withValues(alpha: 0.6))),
              ),
            ]),
          if (_phase == BreathingPhase.active)
            TextButton(
              onPressed: _skip,
              child: Text('Stop', style: TextStyle(color: _teal.withValues(alpha: 0.6))),
            ),
        ],
      ),
    );
  }
}

enum BreathingPhase { ready, active, complete }
