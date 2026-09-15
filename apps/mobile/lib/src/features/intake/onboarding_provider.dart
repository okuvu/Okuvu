import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _prefsKey = 'has_completed_onboarding';

// Persisted via SharedPreferences — main.dart pre-loads an instance before
// runApp() and overrides this provider with it, since Notifier's build()
// must be synchronous and can't call SharedPreferences.getInstance() itself.
// Reading straight from that instance (not a one-shot snapshot bool) means
// this also self-corrects when app.dart invalidates it on sign-out, rather
// than reverting to whatever was true when the app first launched —
// relevant if a different account signs in on the same device afterward.
//
// Without this, the flag reset to false on every relaunch, and returning
// users with a care plan already assigned got re-shown ColdStartScreen's
// "Your space is ready" greeting instead of going straight to Home.
//
// The default (unoverridden) factory below deliberately stays in-memory —
// it's the fallback for any context (tests, previews) that doesn't wire up
// the SharedPreferences override, matching this provider's original
// behavior for those callers rather than throwing on them.
class OnboardingCompleteNotifier extends Notifier<bool> {
  OnboardingCompleteNotifier([this._prefs]);

  final SharedPreferences? _prefs;

  @override
  bool build() => _prefs?.getBool(_prefsKey) ?? false;

  Future<void> complete() async {
    state = true;
    await _prefs?.setBool(_prefsKey, true);
  }
}

final hasCompletedOnboardingProvider =
    NotifierProvider<OnboardingCompleteNotifier, bool>(
        OnboardingCompleteNotifier.new);
