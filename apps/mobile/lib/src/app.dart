import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'router/router.dart';
import 'core/providers.dart';
import 'features/crisis/crisis_overlay.dart';
import 'features/home/care_ended_screen.dart';
import 'features/home/providers/today_card_provider.dart';
import 'theme/app_theme.dart';

class App extends ConsumerWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen(sessionProvider, (previous, next) {
      if (previous == SessionState.authenticated &&
          next == SessionState.unauthenticated) {
        ref.read(webSocketServiceProvider).disconnect();
        ref.invalidate(chatMessagesProvider);
        ref.invalidate(emergencyContactProvider);
        ref.invalidate(voiceSettingsProvider);
        ref.invalidate(crisisOverlayProvider);
        ref.invalidate(consentProvider);
        ref.invalidate(hasCompletedOnboardingProvider);
      }
    });

    final router = ref.watch(routerConfigProvider);
    ref.watch(voiceSyncProvider);

    return MaterialApp.router(
      title: 'OKUVU',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.theme,
      routerConfig: router,
      builder: (context, child) {
        return Stack(
          children: [
            child ?? const SizedBox.shrink(),
            const _CareEndedOverlaySlot(),
            const _CrisisOverlaySlot(),
          ],
        );
      },
    );
  }
}

class _CrisisOverlaySlot extends ConsumerWidget {
  const _CrisisOverlaySlot();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final showCrisis = ref.watch(crisisOverlayProvider);
    if (!showCrisis) return const SizedBox.shrink();
    return const CrisisOverlay();
  }
}

/// Decisions doc round, 15 Sep 2026 §11 — intercepts navigation app-wide
/// once a therapist has ended care, mirroring [_CrisisOverlaySlot]. Placed
/// *below* the crisis slot in the Stack so the crisis line always wins if
/// both are somehow true at once.
class _CareEndedOverlaySlot extends ConsumerWidget {
  const _CareEndedOverlaySlot();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final today = ref.watch(todayCardProvider).asData?.value;
    if (today == null || !today.careEnded) return const SizedBox.shrink();
    return CareEndedScreen(therapistName: today.careEndedByTherapistName);
  }
}
