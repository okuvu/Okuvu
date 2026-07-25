import 'dart:async';

import 'package:flutter/material.dart';
import '../models/tool_card_config.dart';
import 'grounding_card.dart';

class ToolCardWidget extends StatelessWidget {
  final ToolCardConfig config;
  const ToolCardWidget({required this.config, super.key});

  @override
  Widget build(BuildContext context) {
    switch (config.type) {
      case ToolCardType.guidedBreathing:
      case ToolCardType.boxBreathing:
        return GuidedBreathingCard(config: config);
      case ToolCardType.grounding5431:
        return const GroundingCard();
    }
  }
}

class GuidedBreathingCard extends StatefulWidget {
  final ToolCardConfig config;
  const GuidedBreathingCard({required this.config, super.key});

  @override
  State<GuidedBreathingCard> createState() => _GuidedBreathingCardState();
}

class _GuidedBreathingCardState extends State<GuidedBreathingCard> {
  int _currentCycle = 0;
  BreathingPhase _phase = BreathingPhase.inhale;
  Timer? _timer;
  double _progress = 0;
  bool _isRunning = false;

  BreathingConfig get _cfg =>
      widget.config.breathingConfig ?? const BreathingConfig(
        inhaleSeconds: 4,
        holdSeconds: 2,
        exhaleSeconds: 6,
        cycles: 3,
        label: 'Breathing Exercise',
      );

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _startExercise() {
    setState(() {
      _isRunning = true;
      _currentCycle = 0;
      _phase = BreathingPhase.inhale;
      _progress = 0;
    });
    _runPhase();
  }

  void _runPhase() {
    _timer?.cancel();

    int durationSeconds;
    switch (_phase) {
      case BreathingPhase.inhale:
        durationSeconds = _cfg.inhaleSeconds;
      case BreathingPhase.hold:
        durationSeconds = _cfg.holdSeconds;
      case BreathingPhase.exhale:
        durationSeconds = _cfg.exhaleSeconds;
    }

    if (durationSeconds <= 0) {
      _nextPhase();
      return;
    }

    const interval = Duration(milliseconds: 50);
    final totalSteps = durationSeconds * 20;
    int step = 0;

    _timer = Timer.periodic(interval, (timer) {
      step++;
      setState(() => _progress = step / totalSteps);

      if (step >= totalSteps) {
        timer.cancel();
        _nextPhase();
      }
    });
  }

  void _nextPhase() {
    switch (_phase) {
      case BreathingPhase.inhale:
        if (_cfg.holdSeconds > 0) {
          _phase = BreathingPhase.hold;
        } else {
          _phase = BreathingPhase.exhale;
        }
        _progress = 0;
        _runPhase();
        break;
      case BreathingPhase.hold:
        _phase = BreathingPhase.exhale;
        _progress = 0;
        _runPhase();
        break;
      case BreathingPhase.exhale:
        _currentCycle++;
        if (_currentCycle < _cfg.cycles) {
          _phase = BreathingPhase.inhale;
          _progress = 0;
          _runPhase();
        } else {
          setState(() => _isRunning = false);
        }
        break;
    }
  }

  void _stopExercise() {
    _timer?.cancel();
    setState(() {
      _isRunning = false;
      _progress = 0;
      _currentCycle = 0;
      _phase = BreathingPhase.inhale;
    });
  }

  String get _phaseLabel {
    switch (_phase) {
      case BreathingPhase.inhale:
        return 'Breathe In';
      case BreathingPhase.hold:
        return 'Hold';
      case BreathingPhase.exhale:
        return 'Breathe Out';
    }
  }

  IconData get _phaseIcon {
    switch (_phase) {
      case BreathingPhase.inhale:
        return Icons.air;
      case BreathingPhase.hold:
        return Icons.pause_circle_outline;
      case BreathingPhase.exhale:
        return Icons.air_outlined;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cardColor = theme.colorScheme.surfaceContainerHighest;
    final borderColor = theme.colorScheme.outlineVariant;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: cardColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Icon(Icons.self_improvement,
                    size: 20, color: theme.colorScheme.primary),
                const SizedBox(width: 8),
                Text(
                  _cfg.label,
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
                    color: theme.colorScheme.primary,
                  ),
                ),
                const Spacer(),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primaryContainer,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '${_currentCycle}/${_cfg.cycles}',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: theme.colorScheme.onPrimaryContainer,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            if (_isRunning) ...[
              AnimatedContainer(
                duration: const Duration(milliseconds: 300),
                width: 120,
                height: 120,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: _phase == BreathingPhase.inhale
                      ? theme.colorScheme.primaryContainer.withAlpha(180)
                      : _phase == BreathingPhase.hold
                          ? theme.colorScheme.secondaryContainer.withAlpha(180)
                          : theme.colorScheme.tertiaryContainer.withAlpha(180),
                ),
                child: Center(
                  child: Transform.scale(
                    scale: 0.5 + (_progress * 0.5),
                    child: Icon(
                      _phaseIcon,
                      size: 48,
                      color: _phase == BreathingPhase.inhale
                          ? theme.colorScheme.primary
                          : _phase == BreathingPhase.hold
                              ? theme.colorScheme.secondary
                              : theme.colorScheme.tertiary,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Text(
                _phaseLabel,
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                  color: theme.colorScheme.onSurface,
                ),
              ),
              const SizedBox(height: 16),
              TextButton.icon(
                onPressed: _stopExercise,
                icon: const Icon(Icons.stop, size: 18),
                label: const Text('Stop'),
                style: TextButton.styleFrom(foregroundColor: theme.colorScheme.error),
              ),
            ] else ...[
              SizedBox(
                width: 120,
                height: 120,
                child: Center(
                  child: Icon(
                    Icons.self_improvement,
                    size: 56,
                    color: theme.colorScheme.primary.withAlpha(150),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'Take a moment to breathe',
                style: TextStyle(
                  fontSize: 14,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: _startExercise,
                  icon: const Icon(Icons.play_arrow, size: 20),
                  label: Text('Start $_cfg.cycles Cycles'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

enum BreathingPhase { inhale, hold, exhale }

