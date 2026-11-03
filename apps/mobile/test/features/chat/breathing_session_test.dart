import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/features/chat/models/breathing_session.dart';

/// The rules of one sitting, out of the widget: ten breaths a round, a pause
/// between rounds, a hard stop at thirty. Owner round 2 (4 Nov 2026).
void main() {
  BreathSession started() => BreathSession()..start();

  void breathe(BreathSession session, int breaths) {
    for (var i = 0; i < breaths; i++) {
      session.completeBreath();
    }
  }

  test('starts ready and runs once started', () {
    final session = BreathSession();
    expect(session.stage, BreathSessionStage.ready);
    expect(session.round, 1);
    expect(session.totalBreaths, 0);

    session.start();
    expect(session.isActive, isTrue);
  });

  test('nine breaths stay in the first round', () {
    final session = started();
    breathe(session, 9);

    expect(session.stage, BreathSessionStage.active);
    expect(session.totalBreaths, 9);
    expect(session.breathLabel, 'Breath 10 of 10');
  });

  test('the tenth breath pauses the sitting and asks how they feel', () {
    final session = started();
    breathe(session, 10);

    expect(session.stage, BreathSessionStage.paused);
    expect(session.totalBreaths, 10);
    expect(session.canContinue, isTrue);
  });

  test('continue gives a second round of ten, then pauses again', () {
    final session = started();
    breathe(session, 10);
    session.continueSession();

    expect(session.stage, BreathSessionStage.active);
    expect(session.round, 2);
    expect(session.breathsInRound, 0);

    breathe(session, 10);
    expect(session.stage, BreathSessionStage.paused);
    expect(session.totalBreaths, 20);
    expect(session.roundLabel, 'Round 2 of 3');
  });

  test('the third round ends the sitting at thirty breaths, with no continue', () {
    final session = started();
    breathe(session, 10);
    session.continueSession();
    breathe(session, 10);
    session.continueSession();
    breathe(session, 10);

    expect(session.stage, BreathSessionStage.finished);
    expect(session.totalBreaths, 30);
    expect(session.canContinue, isFalse);
    expect(session.isActive, isFalse);
  });

  test('a finished sitting cannot be extended by a stray continue', () {
    final session = started();
    breathe(session, 10);
    session.continueSession();
    breathe(session, 10);
    session.continueSession();
    breathe(session, 10);

    session.continueSession();
    expect(session.stage, BreathSessionStage.finished);
    expect(session.totalBreaths, 30);
  });

  test('stopping mid-round records how many breaths were done', () {
    final session = started();
    breathe(session, 7);
    session.stop();

    expect(session.stage, BreathSessionStage.stopped);
    expect(session.breathsAtStop, 7);
    expect(session.isActive, isFalse);
  });

  test('stopping from the pause screen keeps the ten breaths already done', () {
    final session = started();
    breathe(session, 10);
    session.stop();

    expect(session.stage, BreathSessionStage.stopped);
    expect(session.breathsAtStop, 10);
  });

  test('stopping after the end does not rewrite the ending', () {
    final session = started();
    breathe(session, 10);
    session.continueSession();
    breathe(session, 10);
    session.continueSession();
    breathe(session, 10);

    session.stop();
    expect(session.stage, BreathSessionStage.finished);
  });

  test('a breath after the end is ignored', () {
    final session = started();
    breathe(session, 10);
    session.continueSession();
    breathe(session, 10);
    session.continueSession();
    breathe(session, 10);

    session.completeBreath();
    expect(session.totalBreaths, 30);
  });

  test('start does nothing once the sitting is over', () {
    final session = started();
    breathe(session, 10);
    session.stop();

    session.start();
    expect(session.stage, BreathSessionStage.stopped);
  });

  test('restart returns a clean sitting', () {
    final session = started();
    breathe(session, 10);
    session.continueSession();
    breathe(session, 12);
    session.restart();

    expect(session.stage, BreathSessionStage.ready);
    expect(session.round, 1);
    expect(session.totalBreaths, 0);
    expect(session.breathsAtStop, 0);
  });
}
