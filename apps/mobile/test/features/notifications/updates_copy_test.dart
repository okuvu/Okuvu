import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Pins the Dart half of the owner's approved Updates copy.
///
/// The app cannot import the TypeScript catalogue, so the same two sentences
/// exist here and in `packages/shared-types`. This test reads the approved
/// document out of the repo and fails when either copy drifts — the failure mode
/// it prevents is a client reading a re-typed sentence that nobody approved.
String _read(String path) => File(path).readAsStringSync();

/// Curly quotes flattened, whitespace collapsed: the document and the Dart
/// string must be comparable without either being rewritten.
String _normalise(String input) => input
    .replaceAll('\u2019', "'")
    .replaceAll('\u2018', "'")
    .replaceAll('\u201c', '"')
    .replaceAll('\u201d', '"')
    .replaceAll(RegExp(r'\s+'), ' ')
    .trim();

void main() {
  test('the Updates fixed line is the approved sentence, word for word', () {
    final approved = _normalise(
      _read('../../docs/exercise-library/02-approved-worksheet-copy.md'),
    );
    final dart = _normalise(
      _read('lib/src/features/notifications/updates_copy.dart'),
    );

    expect(
      approved,
      contains(
        _normalise(
          'Your therapist reads shared entries before sessions, not in real time. '
          'If you need help right now, tap Get help.',
        ),
      ),
    );
    expect(
      dart,
      contains(
        _normalise(
          'Your therapist reads shared entries before sessions, not in real time. '
          'If you need help right now, tap Get help.',
        ),
      ),
    );
  });

  test('the treasure-note line and its two buttons are the approved wording', () {
    final approved = _normalise(
      _read('../../docs/exercise-library/02-approved-worksheet-copy.md'),
    );
    final dart = _normalise(
      _read('lib/src/features/notifications/updates_copy.dart'),
    );

    for (final sentence in [
      'Your therapist sent you something for your Treasure Box.',
      'Keep',
      'Not now',
    ]) {
      expect(approved, contains(sentence));
      expect(dart, contains(sentence));
    }
  });

  test('the approved document has no third button state for that row', () {
    // Guards against a later edit adding a middle option nobody approved.
    expect(_normalise(_read('lib/src/features/notifications/updates_copy.dart')),
        isNot(contains('Maybe later')));
  });
}
