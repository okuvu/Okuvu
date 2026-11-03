import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:okuvu/src/features/intake/onboarding_provider.dart';

/// Guards the user-visible bug where "Your space is ready" re-appeared on every
/// app launch: the flag has to survive a process restart, not just live in RAM.
void main() {
  group('hasCompletedOnboardingProvider', () {
    test('complete() is still true after a fresh app start', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();

      final firstLaunch = ProviderContainer(overrides: [
        hasCompletedOnboardingProvider.overrideWith(
          () => OnboardingCompleteNotifier(prefs),
        ),
      ]);
      addTearDown(firstLaunch.dispose);
      expect(firstLaunch.read(hasCompletedOnboardingProvider), isFalse);

      await firstLaunch.read(hasCompletedOnboardingProvider.notifier).complete();
      expect(firstLaunch.read(hasCompletedOnboardingProvider), isTrue);

      // Relaunch: new container, new notifier instance, same on-disk prefs.
      final relaunch = ProviderContainer(overrides: [
        hasCompletedOnboardingProvider.overrideWith(
          () => OnboardingCompleteNotifier(prefs),
        ),
      ]);
      addTearDown(relaunch.dispose);
      expect(relaunch.read(hasCompletedOnboardingProvider), isTrue);
    });
  });
}
