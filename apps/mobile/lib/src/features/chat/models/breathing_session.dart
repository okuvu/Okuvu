/// One sitting of a breathing exercise, as a plain state machine so the rules
/// can be tested without a clock, a screen or a plugin.
///
/// Owner round 2 (4 Nov 2026) replaced the old "run the preset's cycle count
/// and say Done" shape with three counted rounds:
///
/// * a round is 10 breaths;
/// * finishing a round pauses the session and asks how the client feels;
/// * "Continue" starts the next round, "Stop for now" ends the sitting;
/// * the third round ends the sitting on its own with a recommendation to
///   take a break, so nobody is walked into 40+ breaths by one more tap.
///
/// The screen reads [stage] to decide what to show; it never counts breaths
/// itself, so the pause and the hard stop cannot drift from the display.
class BreathSession {
  static const int breathsPerRound = 10;
  static const int maxRounds = 3;

  BreathSessionStage _stage = BreathSessionStage.ready;
  int _round = 1;
  int _breathsInRound = 0;
  int _totalBreaths = 0;
  int _breathsAtStop = 0;

  BreathSessionStage get stage => _stage;

  /// 1-based, capped at [maxRounds].
  int get round => _round;

  /// Breaths completed inside the current round, 0..[breathsPerRound].
  int get breathsInRound => _breathsInRound;

  /// Breaths completed in this sitting, 0..[totalPlanned].
  int get totalBreaths => _totalBreaths;

  /// Breaths completed when the client stopped early, for the closing line.
  int get breathsAtStop => _breathsAtStop;

  /// 30 by construction: 3 rounds of 10.
  int get totalPlanned => breathsPerRound * maxRounds;

  bool get isActive => _stage == BreathSessionStage.active;

  /// True only on the pause screen that still has a round to offer. The third
  /// pause is not a pause: it is the end of the sitting.
  bool get canContinue => _stage == BreathSessionStage.paused && _round < maxRounds;

  /// "Breath 4 of 10" — the one being taken now, so the first breath of a
  /// round reads "Breath 1 of 10" rather than "0 of 10".
  String get breathLabel => 'Breath $currentBreathNumber of $breathsPerRound';

  /// 1-based number of the breath in progress, capped at the round length.
  int get currentBreathNumber =>
      _breathsInRound >= breathsPerRound ? breathsPerRound : _breathsInRound + 1;

  /// "Round 2 of 3"
  String get roundLabel => 'Round $_round of $maxRounds';

  /// Begin (or resume) breathing. A sitting that is over does not restart
  /// from here — [restart] is the deliberate path for that.
  void start() {
    if (_stage == BreathSessionStage.finished || _stage == BreathSessionStage.stopped) {
      return;
    }
    _stage = BreathSessionStage.active;
  }

  /// One full breath completed (in, holds, out).
  void completeBreath() {
    if (_stage != BreathSessionStage.active) return;
    _totalBreaths += 1;
    _breathsInRound += 1;
    if (_breathsInRound < breathsPerRound) return;
    _stage = _round >= maxRounds
        ? BreathSessionStage.finished
        : BreathSessionStage.paused;
  }

  /// The client asked for another ten breaths.
  void continueSession() {
    if (!canContinue) return;
    _round += 1;
    _breathsInRound = 0;
    _stage = BreathSessionStage.active;
  }

  /// The client stopped, whether mid-round or from the pause screen.
  void stop() {
    if (_stage == BreathSessionStage.finished) return;
    _breathsAtStop = _totalBreaths;
    _stage = BreathSessionStage.stopped;
  }

  /// Back to a fresh sitting: "Done" and "Start again" both land here.
  void restart() {
    _stage = BreathSessionStage.ready;
    _round = 1;
    _breathsInRound = 0;
    _totalBreaths = 0;
    _breathsAtStop = 0;
  }
}

enum BreathSessionStage {
  /// Nothing running yet: the Start button is showing.
  ready,

  /// A breath is in progress.
  active,

  /// Ten breaths done, more available: ask how they feel.
  paused,

  /// All three rounds done: recommend a break, no way back in.
  finished,

  /// The client stopped before the end.
  stopped,
}
