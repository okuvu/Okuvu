import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../home/breathing_content.dart';

/// The four breathing shapes, one per technique, so two exercises never look
/// the same on screen (Dr Goswami's instruction, 3 Nov 2026):
///
/// * [BreathVisual.box] — a dot travelling around the four sides of a square.
/// * [BreathVisual.swell] — a circle that fills, swells a little more, then
///   empties. Words, not numbers.
/// * [BreathVisual.wave] — a wave that rises quickly and falls slowly, like a
///   tide going out.
/// * [BreathVisual.ripples] — ripples spreading outward from the centre during
///   the hum.
///
/// Every shape is driven by the same two numbers the player already counts on:
/// [phaseIndex] and [progress] within the phase (both from the animation
/// controller), and [fill], the lung posture at this frame. Nothing here keeps
/// its own clock, which is what let the old number and the old circle drift
/// apart.
class BreathingVisual extends StatelessWidget {
  final BreathVisual kind;
  final int phaseIndex;
  final int phaseCount;
  final double progress;
  final double fill;
  final Color color;
  final Color trackColor;
  final double size;

  const BreathingVisual({
    required this.kind,
    required this.phaseIndex,
    required this.phaseCount,
    required this.progress,
    required this.fill,
    required this.color,
    required this.trackColor,
    this.size = 180,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _BreathingPainter(
          kind: kind,
          phaseIndex: phaseIndex,
          phaseCount: phaseCount,
          progress: progress.clamp(0.0, 1.0),
          fill: fill.clamp(0.0, 1.0),
          color: color,
          trackColor: trackColor,
        ),
      ),
    );
  }
}

class _BreathingPainter extends CustomPainter {
  final BreathVisual kind;
  final int phaseIndex;
  final int phaseCount;
  final double progress;
  final double fill;
  final Color color;
  final Color trackColor;

  const _BreathingPainter({
    required this.kind,
    required this.phaseIndex,
    required this.phaseCount,
    required this.progress,
    required this.fill,
    required this.color,
    required this.trackColor,
  });

  static const _stroke = 4.0;

  @override
  void paint(Canvas canvas, Size size) {
    switch (kind) {
      case BreathVisual.box:
        _paintBox(canvas, size);
      case BreathVisual.swell:
        _paintSwell(canvas, size);
      case BreathVisual.wave:
        _paintWave(canvas, size);
      case BreathVisual.ripples:
        _paintRipples(canvas, size);
    }
  }

  /// A dot travelling around the four sides of a square — one side per phase.
  void _paintBox(Canvas canvas, Size size) {
    final rect = Rect.fromLTWH(
      _stroke / 2,
      _stroke / 2,
      size.width - _stroke,
      size.height - _stroke,
    );
    final rrect = BorderRadius.circular(24).toRRect(rect);

    canvas.drawRRect(
      rrect,
      Paint()
        ..color = trackColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = _stroke,
    );

    final path = Path()..addRRect(rrect);
    final metrics = path.computeMetrics().first;
    final sides = math.max(phaseCount, 1);
    final t = (((phaseIndex + progress) / sides) % 1.0) * metrics.length;
    final tangent = metrics.getTangentForOffset(t);
    if (tangent == null) return;
    final dot = tangent.position;

    canvas.drawCircle(
      dot,
      16,
      Paint()..color = color.withValues(alpha: 0.16),
    );
    canvas.drawCircle(dot, 8, Paint()..color = color);
    canvas.drawCircle(
      dot,
      8,
      Paint()
        ..color = Colors.white.withValues(alpha: 0.85)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
  }

  /// A circle that fills, swells a little more, then empties.
  void _paintSwell(Canvas canvas, Size size) {
    final centre = Offset(size.width / 2, size.height / 2);
    final maxRadius = size.width / 2 - _stroke;
    final radius = maxRadius * (0.30 + 0.66 * fill);

    canvas.drawCircle(
      centre,
      maxRadius,
      Paint()
        ..color = trackColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = _stroke / 2,
    );

    canvas.drawCircle(
      centre,
      radius,
      Paint()..color = color.withValues(alpha: 0.10 + 0.20 * fill),
    );
    canvas.drawCircle(
      centre,
      radius,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = _stroke,
    );

    // The top-up breath gets its own faint outer arc, so "a little more" is
    // visible and not just a slightly bigger circle.
    if (fill > 0.55) {
      final swell = ((fill - 0.55) / 0.45).clamp(0.0, 1.0);
      canvas.drawCircle(
        centre,
        radius + 8 + 6 * swell,
        Paint()
          ..color = color.withValues(alpha: 0.22 * swell)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2,
      );
    }
  }

  /// A wave that rises quickly and falls slowly, like a tide going out.
  void _paintWave(Canvas canvas, Size size) {
    final waterline = size.height - (size.height * 0.12 + size.height * 0.68 * fill);
    const amplitude = 5.0;
    final drift = progress * math.pi * 2 + phaseIndex * math.pi / 2;

    final surface = Path()..moveTo(0, waterline);
    for (double x = 0; x <= size.width; x += 2) {
      final y = waterline + amplitude * math.sin((x / size.width) * math.pi * 2 + drift);
      surface.lineTo(x, y);
    }

    final body = Path.from(surface)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();

    canvas.drawPath(body, Paint()..color = color.withValues(alpha: 0.14));
    canvas.drawPath(
      surface,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = _stroke
        ..strokeCap = StrokeCap.round,
    );

    // A marker on the crest so the eye has one thing to follow.
    final crestY =
        waterline + amplitude * math.sin(math.pi / 2 + drift);
    canvas.drawCircle(Offset(size.width / 2, crestY), 6, Paint()..color = color);
  }

  /// Ripples spreading outward from the centre during the hum.
  void _paintRipples(Canvas canvas, Size size) {
    final centre = Offset(size.width / 2, size.height / 2);
    final maxRadius = size.width / 2 - _stroke;
    final isExhale = phaseIndex >= phaseCount - 1;

    canvas.drawCircle(
      centre,
      maxRadius,
      Paint()
        ..color = trackColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = _stroke / 2,
    );

    if (!isExhale) {
      // Breathing in: a single ring that opens gently, no ripples yet.
      canvas.drawCircle(
        centre,
        maxRadius * (0.28 + 0.24 * fill),
        Paint()
          ..color = color.withValues(alpha: 0.45)
          ..style = PaintingStyle.stroke
          ..strokeWidth = _stroke,
      );
      return;
    }

    // Humming out: three rings peeling away from the centre.
    for (var i = 0; i < 3; i++) {
      final t = (progress + i / 3) % 1.0;
      final radius = maxRadius * (0.22 + 0.78 * t);
      final opacity = (1.0 - t) * 0.5;
      canvas.drawCircle(
        centre,
        radius,
        Paint()
          ..color = color.withValues(alpha: opacity)
          ..style = PaintingStyle.stroke
          ..strokeWidth = _stroke * (1 - 0.4 * t),
      );
    }
    canvas.drawCircle(centre, 7, Paint()..color = color);
  }

  @override
  bool shouldRepaint(covariant _BreathingPainter old) {
    return old.kind != kind ||
        old.phaseIndex != phaseIndex ||
        old.phaseCount != phaseCount ||
        old.progress != progress ||
        old.fill != fill ||
        old.color != color ||
        old.trackColor != trackColor;
  }
}
