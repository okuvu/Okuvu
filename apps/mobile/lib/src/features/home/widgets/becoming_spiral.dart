import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';
import '../providers/becoming_provider.dart';

/// The Okuvu mark, drawn rather than painted on, so it can fill up.
///
/// The geometry is not invented: it reproduces `apps/therapist-portal/public/
/// brand/okuvu-mark.svg` to within 0.01 viewBox units. That file is a tapered
/// ribbon — an Archimedean spiral from radius 13 to 106 over 1.75 turns, width
/// 26·sin(πt), in a 400×400 box, with a honey dot at the outer tip. Rebuilding
/// it from those four numbers is what lets the app fill it along its own
/// length instead of cross-fading a picture.
const double _viewBox = 400;
const double _cx = 200;
const double _cy = 200;
const double _rInner = 13;
const double _rOuter = 106;
const double _ribbonWidth = 26;
const double _turns = 1.75;
const double _k = 2 * math.pi * _turns;
const Offset _tip = Offset(200, 94); // brand kit's `circle cx=200 cy=94 r=7`

/// One purple per completed turn. Light enough at the inner end that the
/// outline is still legible through a young fill, deep enough at the head that
/// a finished turn reads as full colour.
const List<List<Color>> kBecomingShades = [
  [AppColors.orchidSoft, AppColors.royalPurple],
  [AppColors.orchid, AppColors.royalNight],
  [AppColors.lavenderTint, AppColors.violet],
  [AppColors.orchid, AppColors.indigoViolet],
];

/// The ribbon path in viewBox coordinates, built once.
final Path _ribbon = _buildRibbon(320);

Path _buildRibbon(int steps) {
  final outer = <Offset>[];
  final inner = <Offset>[];
  for (var i = 0; i <= steps; i++) {
    final t = i / steps;
    final r = _rInner + (_rOuter - _rInner) * t;
    final theta = _k * t;
    final centre = Offset(_cx + r * math.cos(theta), _cy + r * math.sin(theta));
    final half = _ribbonWidth * math.sin(math.pi * t) / 2;
    // Perpendicular to the curve, not to the radius: the two are 2 units apart
    // at the tightest point, and the SVG follows the perpendicular.
    final tx = (_rOuter - _rInner) * math.cos(theta) - r * _k * math.sin(theta);
    final ty = (_rOuter - _rInner) * math.sin(theta) + r * _k * math.cos(theta);
    final len = math.sqrt(tx * tx + ty * ty);
    final normal = Offset(-ty / len, tx / len);
    outer.add(centre + normal * half);
    inner.add(centre - normal * half);
  }

  final path = Path()..moveTo(outer.first.dx, outer.first.dy);
  for (final p in outer.skip(1)) {
    path.lineTo(p.dx, p.dy);
  }
  for (final p in inner.reversed) {
    path.lineTo(p.dx, p.dy);
  }
  return path..close();
}

/// Radius of the filled head at [fill]: the ribbon centre at that point plus
/// half the ribbon width there, so the colour arrives with a complete tip
/// rather than a slice through the band.
double spiralHeadRadius(double fill) {
  final t = fill.clamp(0.0, 1.0);
  return _rInner +
      (_rOuter - _rInner) * t +
      _ribbonWidth * math.sin(math.pi * t) / 2;
}

/// Where the spiral sits for a given journey. Kept out of the widget so the
/// arithmetic is testable without pumping a frame.
class BecomingSpiralView {
  const BecomingSpiralView({required this.fill, required this.shade});

  final double fill;
  final Color shade;
}

BecomingSpiralView becomingSpiralView(BecomingJourney journey) {
  final fill = journey.fill;
  final shades = kBecomingShades[journey.shadeIndex];
  return BecomingSpiralView(
    fill: fill,
    shade: Color.lerp(shades.first, shades.last, fill)!,
  );
}

class BecomingSpiral extends StatefulWidget {
  const BecomingSpiral({
    super.key,
    required this.journey,
    this.size = 200,
    this.animate = true,
  });

  final BecomingJourney journey;
  final double size;

  /// Off in widget tests that assert a settled picture without pumping time.
  final bool animate;

  @override
  State<BecomingSpiral> createState() => _BecomingSpiralState();
}

class _BecomingSpiralState extends State<BecomingSpiral>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late double _from;
  late double _to;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..value = 1;
    _from = _to = widget.journey.fill;
  }

  @override
  void didUpdateWidget(BecomingSpiral oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.journey.moments != widget.journey.moments) {
      _retarget();
    }
  }

  /// A new moment grows the fill from where it is. A completed turn restarts
  /// from the inner end — that jump back to zero IS the motif, so it is a cut,
  /// not an animation from full to empty.
  void _retarget() {
    final target = widget.journey.fill;
    final current = _currentFill;
    _from = target < current ? 0 : current;
    _to = target;
    if (widget.animate) {
      _controller.forward(from: 0);
    } else {
      _controller.value = 1;
    }
  }

  double get _currentFill {
    if (_to <= _from) return _to;
    return _from + (_to - _from) * Curves.easeOutCubic.transform(_controller.value);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Decoration, not information: a screen reader has nothing useful to say
    // about how full an ornament is, and the fill is deliberately not a score.
    return ExcludeSemantics(
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          final shades = kBecomingShades[widget.journey.shadeIndex];
          final fill = _currentFill;
          return CustomPaint(
            size: Size.square(widget.size),
            painter: _BecomingSpiralPainter(
              fill: fill,
              shade: Color.lerp(shades.first, shades.last, fill)!,
            ),
          );
        },
      ),
    );
  }
}

class _BecomingSpiralPainter extends CustomPainter {
  const _BecomingSpiralPainter({required this.fill, required this.shade});

  final double fill;
  final Color shade;

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.shortestSide / _viewBox;
    canvas.save();
    canvas.translate(
      (size.width - _viewBox * scale) / 2,
      (size.height - _viewBox * scale) / 2,
    );
    canvas.scale(scale);

    // The bare outline: the ribbon's own contour, so nothing about the shape
    // changes as it fills, only how much of it carries colour.
    canvas.drawPath(
      _ribbon,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.0
        ..color = AppColors.indigoViolet.withValues(alpha: 0.38),
    );

    if (fill > 0) {
      canvas.save();
      canvas.clipPath(
        Path()
          ..addOval(
            Rect.fromCircle(
              center: const Offset(_cx, _cy),
              radius: spiralHeadRadius(fill),
            ),
          ),
      );
      canvas.drawPath(
        _ribbon,
        Paint()
          ..style = PaintingStyle.fill
          ..color = shade,
      );
      canvas.restore();
    }

    // The honey tip: the head of the spiral, lit whether or not it has filled.
    canvas.drawCircle(_tip, 7, Paint()..color = AppColors.honey);
    canvas.restore();
  }

  @override
  bool shouldRepaint(_BecomingSpiralPainter old) =>
      old.fill != fill || old.shade != shade;
}
