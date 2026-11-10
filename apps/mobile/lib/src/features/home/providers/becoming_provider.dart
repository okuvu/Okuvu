import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// How many moments of use complete one turn of the spiral.
///
/// A "moment" is one act of using the app: sending a message to OKUVU, saving a
/// journal entry, saving a mood check-in, finishing a worksheet. Ten is small
/// enough that a client who uses the app for a few days sees movement and large
/// enough that the spiral is not full in one sitting.
const int kMomentsPerTurn = 10;

const String _prefsKey = 'becoming_moments';

/// How many distinct purples the motif cycles through before it starts again.
/// The colours themselves live beside the painter (`becoming_spiral.dart`);
/// a test pins this number to that list so the two cannot drift.
const int kBecomingShadeCount = 4;

/// The journey so far, in the two numbers the spiral needs.
///
/// [moments] only ever goes up; [fill] is where the current turn has reached
/// (0 = bare outline, just under 1 = one filament short of complete), and
/// [shadeIndex] picks which purple this turn is filling with. When a turn
/// completes the fill restarts from the inner end in the next shade, which is
/// the whole point of the motif: it never finishes being itself.
class BecomingJourney {
  const BecomingJourney({this.moments = 0});

  final int moments;

  /// Completed turns. Also the shade cycle position. The turn that is being
  /// filled right now counts for the shade, so a client one moment into the
  /// second turn is still looking at the first turn's colour at full depth.
  int get turn => moments == 0 ? 0 : (moments - 1) ~/ kMomentsPerTurn;

  /// How much of this turn is filled: 0.0 at the bare outline, exactly 1.0 on
  /// the moment that completes it, and a fresh, short fill on the next one.
  /// The full reading matters — a turn whose last moment showed 0.9 would
  /// never actually be seen complete, and the restart would read as a bug.
  double get fill {
    if (moments == 0) return 0;
    final into = moments % kMomentsPerTurn;
    return into == 0 ? 1 : into / kMomentsPerTurn;
  }

  /// Which shade this turn fills with. Cycles through the purple family so a
  /// restart is visibly a new turn and not a reset.
  int get shadeIndex => turn % kBecomingShadeCount;

  bool get isBareOutline => moments == 0;
}

// Persisted via SharedPreferences — main.dart pre-loads an instance before
// runApp() and overrides this provider with it, since Notifier's build() must
// be synchronous. The unoverridden factory deliberately stays in-memory, the
// same way `hasCompletedOnboardingProvider` does, so tests and previews that
// never wire prefs still get a working (if forgetful) spiral.
class BecomingJourneyNotifier extends Notifier<BecomingJourney> {
  BecomingJourneyNotifier([this._prefs]);

  final SharedPreferences? _prefs;

  @override
  BecomingJourney build() =>
      BecomingJourney(moments: _prefs?.getInt(_prefsKey) ?? 0);

  /// One act of use. Called from the paths that already succeed on their own —
  /// it never gates, blocks or reports anything, so a failure to save the count
  /// can never cost the client the thing they were actually doing.
  void recordMoment() {
    state = BecomingJourney(moments: state.moments + 1);
    _persist(state.moments);
  }

  void _persist(int moments) {
    final prefs = _prefs;
    if (prefs == null) return;
    unawaited(
      prefs.setInt(_prefsKey, moments).catchError((Object _) => false),
    );
  }
}

final becomingJourneyProvider =
    NotifierProvider<BecomingJourneyNotifier, BecomingJourney>(
        BecomingJourneyNotifier.new);
