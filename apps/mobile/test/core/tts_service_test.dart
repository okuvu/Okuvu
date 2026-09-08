import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/services.dart';

import 'package:okuvu/src/core/tts_service.dart';

void main() {
  const channel = MethodChannel('flutter_tts');
  final List<MethodCall> log = [];

  /// Creates a [TtsService] and installs a mock that records calls into [log].
  /// [languageAvailable] controls what `isLanguageAvailable` returns.
  (TtsService, void Function()) createService({bool languageAvailable = true}) {
    log.clear();

    Future<dynamic> handler(MethodCall call) async {
      log.add(call);
      switch (call.method) {
        case 'speak':
          return 1;
        case 'stop':
          return 1;
        case 'isLanguageAvailable':
          return languageAvailable;
        default:
          return null;
      }
    }

    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, handler);

    final service = TtsService();
    return (service, () {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, null);
    });
  }

  group('voiceEnabled', () {
    testWidgets('defaults to false', (tester) async {
      final (service, cleanup) = createService();
      addTearDown(cleanup);
      expect(service.voiceEnabled, false);
    });

    testWidgets('setVoiceEnabled(true) updates getter', (tester) async {
      final (service, cleanup) = createService();
      addTearDown(cleanup);

      await service.setVoiceEnabled(true);
      expect(service.voiceEnabled, true);
    });

    testWidgets('setVoiceEnabled(false) stops current speech', (tester) async {
      final (service, cleanup) = createService();
      addTearDown(cleanup);

      await service.setVoiceEnabled(false);

      expect(log, hasLength(1));
      expect(log.single.method, 'stop');
    });
  });

  group('speak', () {
    testWidgets('does nothing when voice is disabled', (tester) async {
      final (service, cleanup) = createService();
      addTearDown(cleanup);

      await service.speak('Hello');

      expect(log, isEmpty);
    });

    testWidgets('silent fallback when language is unavailable', (tester) async {
      final (service, cleanup) = createService(languageAvailable: false);
      addTearDown(cleanup);
      await service.setVoiceEnabled(true);

      await service.speak('Hello');

      expect(log, hasLength(1));
      expect(log.single.method, 'isLanguageAvailable');
    });

    testWidgets('stops previous speech then speaks', (tester) async {
      final (service, cleanup) = createService();
      addTearDown(cleanup);
      await service.setVoiceEnabled(true);

      await service.speak('Hello');

      expect(log, hasLength(3));
      expect(log[0].method, 'isLanguageAvailable');
      expect(log[1].method, 'stop');
      expect(log[2].method, 'speak');
      expect(log[2].arguments, 'Hello');
    });

    testWidgets('does not crash when engine throws', (tester) async {
      final (service, cleanup) = createService();
      addTearDown(cleanup);
      await service.setVoiceEnabled(true);

      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (MethodCall call) async {
        log.add(call);
        if (call.method == 'speak') throw PlatformException(code: 'TTS_ERROR');
        if (call.method == 'isLanguageAvailable') return true;
        if (call.method == 'stop') return 1;
        return null;
      });

      await service.speak('Hello');

      expect(log.any((c) => c.method == 'speak'), true);
    });
  });

  group('stop', () {
    testWidgets('calls stop on the engine', (tester) async {
      final (service, cleanup) = createService();
      addTearDown(cleanup);

      await service.stop();

      expect(log, hasLength(1));
      expect(log.single.method, 'stop');
    });

    testWidgets('does not crash when engine throws', (tester) async {
      final (service, cleanup) = createService();
      addTearDown(cleanup);

      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (MethodCall call) async {
        log.add(call);
        if (call.method == 'stop') throw PlatformException(code: 'STOP_ERROR');
        return null;
      });

      await service.stop();

      expect(log.any((c) => c.method == 'stop'), true);
    });
  });

  group('isLanguageAvailable', () {
    testWidgets('returns true when engine reports available', (tester) async {
      final (service, cleanup) = createService(languageAvailable: true);
      addTearDown(cleanup);

      final result = await service.isLanguageAvailable();

      expect(result, true);
      expect(log.single.method, 'isLanguageAvailable');
      expect(log.single.arguments, 'en-US');
    });

    testWidgets('returns false when engine reports unavailable', (tester) async {
      final (service, cleanup) = createService(languageAvailable: false);
      addTearDown(cleanup);

      final result = await service.isLanguageAvailable();

      expect(result, false);
    });

    testWidgets('returns false when engine throws', (tester) async {
      final (service, cleanup) = createService();
      addTearDown(cleanup);

      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (MethodCall call) async {
        log.add(call);
        if (call.method == 'isLanguageAvailable') {
          throw PlatformException(code: 'CHECK_ERROR');
        }
        return null;
      });

      final result = await service.isLanguageAvailable();

      expect(result, false);
      expect(log.any((c) => c.method == 'isLanguageAvailable'), true);
    });
  });

  group('dispose', () {
    testWidgets('stops the engine', (tester) async {
      final (service, cleanup) = createService();
      addTearDown(cleanup);

      service.dispose();

      expect(log, hasLength(1));
      expect(log.single.method, 'stop');
    });
  });
}
