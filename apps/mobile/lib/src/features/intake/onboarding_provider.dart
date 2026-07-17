import 'package:flutter_riverpod/flutter_riverpod.dart';

class OnboardingCompleteNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  void complete() => state = true;
}

final hasCompletedOnboardingProvider =
    NotifierProvider<OnboardingCompleteNotifier, bool>(
        OnboardingCompleteNotifier.new);
