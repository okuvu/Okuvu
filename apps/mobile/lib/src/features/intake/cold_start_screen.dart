import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'care_plan_provider.dart';
import 'onboarding_provider.dart';
import '../../theme/app_colors.dart';

class ColdStartScreen extends ConsumerStatefulWidget {
  const ColdStartScreen({super.key});

  @override
  ConsumerState<ColdStartScreen> createState() => _ColdStartScreenState();
}

class _ColdStartScreenState extends ConsumerState<ColdStartScreen> {
  bool _navigated = false;

  void _resolveNextScreen() {
    if (_navigated) return;
    _navigated = true;

    final goToHome = ref.read(hasCompletedOnboardingProvider);

    // This can be triggered from within build() (via carePlanAsync.when's
    // data/error branches below) — calling context.go() synchronously there
    // throws ("Router ... cannot be marked as needing to build because the
    // framework is already in the process of building widgets"). Defer to
    // the next frame, which is safe whether the trigger was build-time or
    // the ref.listen callback above.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.go(goToHome ? '/home' : '/onboarding/consent');
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    ref.listen<AsyncValue<UserCarePlan?>>(userCarePlanProvider, (prev, next) {
      next.whenOrNull(
        data: (plan) {
          if (plan == null) _resolveNextScreen();
        },
        error: (_, __) {
          _resolveNextScreen();
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
            _resolveNextScreen();
            return const SizedBox.shrink();
          },
          data: (plan) {
            if (plan == null || ref.read(hasCompletedOnboardingProvider)) {
              // Either no care plan yet (handled by _resolveNextScreen's own
              // fallback to consent), or this is a returning user — the
              // wireframe is explicit that repeat visits get no welcome,
              // consent, or questions ever again, straight to Home. Without
              // this check, every fresh sign-in re-showed "Your space is
              // ready" and routed through /chat instead of /home.
              _resolveNextScreen();
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
                    'OKUVU',
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
                    "Your therapist has set up your focus area and you're ready to begin. OKUVU will work alongside your sessions.",
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
                            color: AppColors.inkSoft,
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
                            color: AppColors.violet,
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
      ..color = AppColors.violet
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
      ..color = AppColors.violet
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
