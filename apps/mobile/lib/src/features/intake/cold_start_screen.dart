import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'care_plan_provider.dart';

class ColdStartScreen extends ConsumerStatefulWidget {
  const ColdStartScreen({super.key});

  @override
  ConsumerState<ColdStartScreen> createState() => _ColdStartScreenState();
}

class _ColdStartScreenState extends ConsumerState<ColdStartScreen> {
  bool _navigated = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    ref.listen<AsyncValue<UserCarePlan?>>(userCarePlanProvider, (prev, next) {
      next.whenOrNull(
        data: (plan) {
          if (_navigated) return;
          if (plan == null) {
            _navigated = true;
            context.go('/onboarding/consent');
          }
        },
        error: (_, __) {
          if (_navigated) return;
          _navigated = true;
          context.go('/onboarding/consent');
        },
      );
    });

    final carePlanAsync = ref.watch(userCarePlanProvider);

    return Scaffold(
      body: SafeArea(
        child: carePlanAsync.when(
          loading: () => const Center(
            child: CircularProgressIndicator(),
          ),
          error: (_, __) {
            if (!_navigated) {
              _navigated = true;
              context.go('/onboarding/consent');
            }
            return const SizedBox.shrink();
          },
          data: (plan) {
            if (plan == null) {
              if (!_navigated) {
                _navigated = true;
                context.go('/onboarding/consent');
              }
              return const SizedBox.shrink();
            }
            return _buildContent(theme, plan.focusAreaName);
          },
        ),
      ),
    );
  }

  Widget _buildContent(ThemeData theme, String focusAreaName) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final contentHeight = constraints.maxHeight * 0.6;
        return Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Container(
              constraints: BoxConstraints(minHeight: contentHeight),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Evia',
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 32),
                  SizedBox(
                    width: 80,
                    height: 80,
                    child: CustomPaint(
                      painter: _ConnectedPeoplePainter(),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'Your space is ready.',
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w600,
                      color: theme.colorScheme.onSurface,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    "Your therapist has set up your focus area and you're ready to begin. Evia will work alongside your sessions.",
                    style: theme.textTheme.bodyLarge?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 32),
                  Container(
                    width: double.infinity,
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: theme.colorScheme.outlineVariant),
                    ),
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Your focus area',
                          style: TextStyle(
                            fontSize: 12,
                            color: Color(0xFF6B6B6B),
                            letterSpacing: 1.2,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          focusAreaName,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF1A6B5A),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 32),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: FilledButton(
                      onPressed: () => context.go('/chat'),
                      child: const Text('Let\'s begin'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _ConnectedPeoplePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFF1A6B5A)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round;

    final cx = size.width / 2;
    final cy = size.height / 2;
    final r = size.width * 0.24;
    final headR = size.width * 0.11;

    void drawPerson(double dx, double dy) {
      canvas.drawCircle(Offset(cx + dx, cy + dy - r * 0.4), headR, paint);
      final shoulderY = cy + dy - r * 0.4 + headR * 1.5;
      final bodyBottomY = cy + dy + r * 0.5;
      canvas.drawLine(
        Offset(cx + dx, shoulderY),
        Offset(cx + dx, bodyBottomY),
        paint,
      );
      canvas.drawLine(
        Offset(cx + dx - r * 0.45, shoulderY - r * 0.1),
        Offset(cx + dx + r * 0.45, shoulderY - r * 0.1),
        paint,
      );
    }

    drawPerson(-r * 0.5, 0);
    drawPerson(r * 0.5, 0);

    final heartPaint = Paint()
      ..color = const Color(0xFF1A6B5A)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;

    final heartPath = Path();
    final hx = cx;
    final hy = cy + r * 0.65;
    final hs = size.width * 0.035;
    heartPath.moveTo(hx, hy + hs * 1.5);
    heartPath.cubicTo(hx, hy + hs * 1.5, hx - hs, hy + hs, hx - hs, hy + hs * 0.3);
    heartPath.cubicTo(hx - hs, hy - hs * 0.3, hx, hy - hs * 0.6, hx, hy - hs * 0.3);
    heartPath.cubicTo(hx, hy - hs * 0.6, hx + hs, hy - hs * 0.3, hx + hs, hy + hs * 0.3);
    heartPath.cubicTo(hx + hs, hy + hs, hx, hy + hs * 1.5, hx, hy + hs * 1.5);
    canvas.drawPath(heartPath, heartPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}