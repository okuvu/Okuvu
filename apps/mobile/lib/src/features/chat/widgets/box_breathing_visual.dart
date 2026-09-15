import 'package:flutter/material.dart';

/// Animated square outline for box breathing: the highlighted edge advances
/// as the active phase progresses.
/// Edge order: 0 = left (inhale, bottom-to-top), 1 = top (hold, left-to-right),
/// 2 = right (exhale, top-to-bottom), 3 = bottom (hold, right-to-left).
class BoxBreathingVisual extends StatelessWidget {
  final int phase;
  final double progress;
  final Color color;
  final Color trackColor;
  final double size;

  const BoxBreathingVisual({
    required this.phase,
    required this.progress,
    required this.color,
    required this.trackColor,
    this.size = 160,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _BoxBreathingPainter(
          phase: phase,
          progress: progress.clamp(0.0, 1.0),
          color: color,
          trackColor: trackColor,
        ),
      ),
    );
  }
}

class _BoxBreathingPainter extends CustomPainter {
  final int phase;
  final double progress;
  final Color color;
  final Color trackColor;

  const _BoxBreathingPainter({
    required this.phase,
    required this.progress,
    required this.color,
    required this.trackColor,
  });

  static const _strokeWidth = 4.0;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Rect.fromLTWH(
      _strokeWidth / 2,
      _strokeWidth / 2,
      size.width - _strokeWidth,
      size.height - _strokeWidth,
    );
    final borderRadius = BorderRadius.circular(20);
    final rrect = borderRadius.toRRect(rect);

    final trackPaint = Paint()
      ..color = trackColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = _strokeWidth;
    canvas.drawRRect(rrect, trackPaint);

    final activePaint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = _strokeWidth
      ..strokeCap = StrokeCap.round;

    final Offset start;
    final Offset end;
    switch (phase) {
      case 0:
        start = rect.bottomLeft;
        end = rect.topLeft;
        break;
      case 1:
        start = rect.topLeft;
        end = rect.topRight;
        break;
      case 2:
        start = rect.topRight;
        end = rect.bottomRight;
        break;
      default:
        start = rect.bottomRight;
        end = rect.bottomLeft;
    }
    final current = Offset.lerp(start, end, progress)!;
    canvas.drawLine(start, current, activePaint);
  }

  @override
  bool shouldRepaint(covariant _BoxBreathingPainter oldDelegate) {
    return oldDelegate.phase != phase ||
        oldDelegate.progress != progress ||
        oldDelegate.color != color ||
        oldDelegate.trackColor != trackColor;
  }
}
