import 'package:flutter/material.dart';

import '../mood_vocabulary.dart';

/// The five faces, drawn with the app's own paint and the OKUVU brand colours.
///
/// No emoji: a system emoji font renders differently on every handset, cannot
/// take the brand palette, and the same "face" can look angry on one phone and
/// blank on another. These are paths, so the five faces are identical on every
/// device and in every screenshot.
///
/// The geometry is 48x48 units and is mirrored exactly by
/// `apps/therapist-portal/src/app/clients/[id]/_components/MoodFace.tsx`, so the
/// therapist sees the same face the client tapped.
class MoodFace extends StatelessWidget {
  const MoodFace({
    super.key,
    required this.value,
    this.size = 52,
    this.selected = false,
  });

  final int value;
  final double size;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final face = moodFaceFor(value);
    if (face == null) return SizedBox(width: size, height: size);
    return Semantics(
      label: face.label,
      child: CustomPaint(
        size: Size.square(size),
        painter: MoodFacePainter(style: face, selected: selected),
      ),
    );
  }
}

class MoodFacePainter extends CustomPainter {
  const MoodFacePainter({required this.style, this.selected = false});

  final MoodFaceStyle style;
  final bool selected;

  /// Mouth endpoints and control point per face, in the 48-unit box.
  /// A control point ABOVE the endpoints curves the mouth up into a frown;
  /// below them it is a smile.
  static const Map<int, List<double>> _mouths = {
    1: [15, 32, 24, 22.5, 33, 32], // Awful — deep frown
    2: [16, 31, 24, 25.5, 32, 31], // Low — slight frown
    3: [16, 30, 24, 30, 32, 30], // Okay — flat
    4: [16, 29, 24, 34.5, 32, 29], // Good — smile
    5: [15, 28, 24, 38, 33, 28], // Great — wide smile
  };

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 48.0;
    final center = Offset(24 * s, 24 * s);

    final stroke = Paint()
      ..color = style.stroke
      ..style = PaintingStyle.stroke
      ..strokeWidth = (selected ? 3.0 : 2.0) * s
      ..strokeCap = StrokeCap.round;

    if (selected) {
      canvas.drawCircle(
        center,
        23 * s,
        Paint()..color = style.stroke.withValues(alpha: 0.16),
      );
    }

    canvas.drawCircle(center, 20 * s, Paint()..color = style.fill);
    canvas.drawCircle(center, 20 * s, stroke);

    final eyePaint = Paint()..color = style.stroke;
    canvas.drawCircle(Offset(17 * s, 20 * s), 2.2 * s, eyePaint);
    canvas.drawCircle(Offset(31 * s, 20 * s), 2.2 * s, eyePaint);

    // The two heavy faces carry brows, so "Awful" reads as more than a smaller
    // frown on a small screen.
    if (style.value == 1 || style.value == 2) {
      final inner = style.value == 1 ? 18.4 : 18.0;
      final outer = style.value == 1 ? 14.6 : 15.2;
      canvas.drawLine(
        Offset(13 * s, outer * s),
        Offset(20 * s, inner * s),
        stroke,
      );
      canvas.drawLine(
        Offset(35 * s, outer * s),
        Offset(28 * s, inner * s),
        stroke,
      );
    }

    final mouth = _mouths[style.value]!;
    final path = Path()
      ..moveTo(mouth[0] * s, mouth[1] * s)
      ..quadraticBezierTo(mouth[2] * s, mouth[3] * s, mouth[4] * s, mouth[5] * s);
    canvas.drawPath(
      path,
      stroke..strokeWidth = (selected ? 2.8 : 2.2) * s,
    );
  }

  @override
  bool shouldRepaint(MoodFacePainter oldDelegate) =>
      oldDelegate.selected != selected || oldDelegate.style != style;
}

/// The row of five faces with their words, and the tap that chooses one.
///
/// One tap is the whole rating: the face is the 1-5 value, and the word under it
/// is the same value in plain language.
class MoodFaceRow extends StatelessWidget {
  const MoodFaceRow({
    super.key,
    required this.onSelected,
    this.selected,
    this.faceSize = 52,
  });

  final ValueChanged<int> onSelected;
  final int? selected;
  final double faceSize;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        for (final face in kMoodFaces)
          Expanded(
            child: _FaceButton(
              face: face,
              size: faceSize,
              isSelected: selected == face.value,
              onTap: () => onSelected(face.value),
            ),
          ),
      ],
    );
  }
}

class _FaceButton extends StatelessWidget {
  const _FaceButton({
    required this.face,
    required this.size,
    required this.isSelected,
    required this.onTap,
  });

  final MoodFaceStyle face;
  final double size;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: isSelected,
      label: face.label,
      child: InkWell(
        key: Key('mood_face_${face.value}'),
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AnimatedScale(
                duration: const Duration(milliseconds: 180),
                scale: isSelected ? 1.08 : 1.0,
                child: MoodFace(value: face.value, size: size, selected: isSelected),
              ),
              const SizedBox(height: 6),
              Text(
                face.label,
                key: Key('mood_face_label_${face.value}'),
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                  color: isSelected ? face.stroke : const Color(0xFF6E658A),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
