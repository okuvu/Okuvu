import 'package:flutter_test/flutter_test.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;

import 'package:okuvu/src/core/speech_service.dart';

/// Stands in for the platform recognizer. Only the handful of members
/// SpeechService actually touches are overridden.
class _FakeRecognizer extends stt.SpeechToText {
  _FakeRecognizer({
    this.localesToReport = const [],
    this.initializeSucceeds = true,
    this.listenThrows = false,
  }) : super.withMethodChannel();

  final List<stt.LocaleName> localesToReport;
  final bool initializeSucceeds;
  final bool listenThrows;

  int initializeCalls = 0;
  int stopCalls = 0;
  int cancelCalls = 0;
  bool listening = false;
  String? lastLocaleId;
  stt.SpeechListenOptions? lastOptions;

  @override
  Future<bool> initialize({
    stt.SpeechErrorListener? onError,
    stt.SpeechStatusListener? onStatus,
    debugLogging = false,
    Duration finalTimeout = stt.SpeechToText.defaultFinalTimeout,
    List<stt.SpeechConfigOption>? options,
  }) async {
    initializeCalls++;
    return initializeSucceeds;
  }

  @override
  Future<List<stt.LocaleName>> locales() async => localesToReport;

  @override
  bool get isListening => listening;

  @override
  Future listen({
    stt.SpeechResultListener? onResult,
    Duration? listenFor,
    Duration? pauseFor,
    String? localeId,
    stt.SpeechSoundLevelChange? onSoundLevelChange,
    cancelOnError = false,
    partialResults = true,
    onDevice = false,
    stt.ListenMode listenMode = stt.ListenMode.confirmation,
    sampleRate = 0,
    stt.SpeechListenOptions? listenOptions,
  }) async {
    if (listenThrows) throw Exception('recognizer exploded');
    lastOptions = listenOptions;
    lastLocaleId = listenOptions?.localeId ?? localeId;
    listening = true;
  }

  @override
  Future<void> stop() async {
    stopCalls++;
    listening = false;
  }

  @override
  Future<void> cancel() async {
    cancelCalls++;
    listening = false;
  }
}

SpeechService _service(
  _FakeRecognizer recognizer, {
  PermissionStatus permission = PermissionStatus.granted,
}) {
  return SpeechService(
    recognizer: recognizer,
    requestMicrophone: () async => permission,
  );
}

void main() {
  group('SpeechService', () {
    test('asks the recognizer for English on an India-first device', () async {
      final recognizer = _FakeRecognizer(
        localesToReport: [
          stt.LocaleName('hi_IN', 'Hindi (India)'),
          stt.LocaleName('en_IN', 'English (India)'),
          stt.LocaleName('en_US', 'English (United States)'),
        ],
      );

      final outcome = await _service(recognizer).start(onWords: (_, __) {}, onEnded: () {});

      expect(outcome, SpeechStartOutcome.listening);
      expect(recognizer.lastLocaleId, 'en_IN');
    });

    test('falls back to any English locale when en_IN is missing', () async {
      final recognizer = _FakeRecognizer(
        localesToReport: [
          stt.LocaleName('hi_IN', 'Hindi (India)'),
          stt.LocaleName('en_US', 'English (United States)'),
        ],
      );

      await _service(recognizer).start(onWords: (_, __) {}, onEnded: () {});

      expect(recognizer.lastLocaleId, 'en_US');
    });

    test('leaves the choice to the device when it has no English recognizer', () async {
      // Refusing outright would break the mic on a phone that simply has no
      // English pack; the recognizer's default is the better failure mode.
      final recognizer = _FakeRecognizer(
        localesToReport: [stt.LocaleName('hi_IN', 'Hindi (India)')],
      );

      await _service(recognizer).start(onWords: (_, __) {}, onEnded: () {});

      expect(recognizer.lastLocaleId, isNull);
    });

    test('dictation is tuned for sentences, with a bounded session', () async {
      final recognizer = _FakeRecognizer();

      await _service(recognizer).start(onWords: (_, __) {}, onEnded: () {});

      final options = recognizer.lastOptions!;
      expect(options.listenMode, stt.ListenMode.dictation);
      expect(options.partialResults, isTrue);
      expect(options.cancelOnError, isTrue);
      expect(options.pauseFor, const Duration(seconds: 3));
      expect(options.listenFor, const Duration(seconds: 60));
      // Streaming audio off-device is the deliberate default; flipping this
      // to true is a privacy/privacy-vs-reach decision, not a code change.
      expect(options.onDevice, isFalse);
    });

    test('a denied permission never reaches the recognizer', () async {
      final recognizer = _FakeRecognizer();

      final outcome = await _service(recognizer, permission: PermissionStatus.denied)
          .start(onWords: (_, __) {}, onEnded: () {});

      expect(outcome, SpeechStartOutcome.permissionDenied);
      expect(recognizer.initializeCalls, 0);
    });

    test('a permanently denied permission is reported separately', () async {
      // The UI has to point at Settings for this one — re-asking does nothing.
      final recognizer = _FakeRecognizer();

      final outcome = await _service(recognizer, permission: PermissionStatus.permanentlyDenied)
          .start(onWords: (_, __) {}, onEnded: () {});

      expect(outcome, SpeechStartOutcome.permissionBlocked);
      expect(recognizer.initializeCalls, 0);
    });

    test('a device with no recognizer is unavailable, not an error', () async {
      final recognizer = _FakeRecognizer(initializeSucceeds: false);

      final outcome = await _service(recognizer).start(onWords: (_, __) {}, onEnded: () {});

      expect(outcome, SpeechStartOutcome.unavailable);
    });

    test('a recognizer that throws surfaces as an error', () async {
      final recognizer = _FakeRecognizer(listenThrows: true);

      final outcome = await _service(recognizer).start(onWords: (_, __) {}, onEnded: () {});

      expect(outcome, SpeechStartOutcome.error);
    });

    test('initialize is called once across sessions', () async {
      final recognizer = _FakeRecognizer();
      final service = _service(recognizer);

      await service.start(onWords: (_, __) {}, onEnded: () {});
      await service.stop();
      await service.start(onWords: (_, __) {}, onEnded: () {});

      expect(recognizer.initializeCalls, 1);
    });

    test('a second start while already listening does not stack sessions', () async {
      final recognizer = _FakeRecognizer();
      final service = _service(recognizer);

      await service.start(onWords: (_, __) {}, onEnded: () {});
      final second =
          await service.start(onWords: (_, __) {}, onEnded: () {});

      expect(second, SpeechStartOutcome.listening);
    });

    test('stop and cancel do nothing when no session is running', () async {
      final recognizer = _FakeRecognizer();
      final service = _service(recognizer);

      await service.stop();
      await service.cancel();

      expect(recognizer.stopCalls, 0);
      expect(recognizer.cancelCalls, 0);
    });
  });
}
