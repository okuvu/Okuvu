import 'package:permission_handler/permission_handler.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;

import 'logger.dart';

/// Why a dictation attempt did or did not start. The UI needs these
/// separately: "ask again" and "you must change this in Settings" are
/// different messages, and neither is the same as "this phone can't do it".
enum SpeechStartOutcome {
  listening,
  permissionDenied,
  permissionBlocked,
  unavailable,
  error,
}

/// Talk-instead-of-typing, wrapped so it can be faked in tests.
///
/// The transcription itself is done by the handset: Android's own speech
/// recognizer (usually Google's) or iOS's. That means no server, no API key
/// and no per-request cost — the trade is that most Android phones stream
/// the audio to Google's recognizer to transcribe it, so a recording does
/// leave the device. `onDevice: true` below would forbid that, but it fails
/// outright on handsets without a downloaded offline English model, so it is
/// left off deliberately; flip it if privacy ever outweighs reach.
///
/// English is pinned when the device has an English recognizer: a phone set
/// to another system language would otherwise transcribe in that language.
class SpeechService {
  SpeechService({
    stt.SpeechToText? recognizer,
    Future<PermissionStatus> Function()? requestMicrophone,
  })  : _recognizer = recognizer ?? stt.SpeechToText(),
        _requestMicrophone = requestMicrophone ?? Permission.microphone.request;

  final stt.SpeechToText _recognizer;

  /// Injectable so the permission branches can be tested without a device.
  final Future<PermissionStatus> Function() _requestMicrophone;

  bool _initialized = false;
  String? _englishLocaleId;

  /// A session stops on its own after a minute of dictation — a phone put
  /// down mid-sentence must not keep the microphone open.
  static const Duration _listenFor = Duration(seconds: 60);

  /// This much silence ends the utterance, which is what makes the mic feel
  /// like "talk, then it's done" rather than "remember to tap stop".
  static const Duration _pauseFor = Duration(seconds: 3);

  /// Returns once the recognizer is live. [onWords] fires repeatedly with the
  /// cumulative transcript so far (partial results, then a final one);
  /// [onEnded] fires when the session finishes on its own — silence, timeout
  /// or an error the platform recovered from by cancelling.
  Future<SpeechStartOutcome> start({
    required void Function(String words, bool isFinal) onWords,
    required void Function() onEnded,
  }) async {
    // A second tap while the first session is still starting would otherwise
    // ask the platform for a second session on top of the first.
    if (_recognizer.isListening) return SpeechStartOutcome.listening;

    final status = await _requestMicrophone();
    if (status.isPermanentlyDenied) {
      return SpeechStartOutcome.permissionBlocked;
    }
    if (!status.isGranted) {
      return SpeechStartOutcome.permissionDenied;
    }

    try {
      if (!_initialized) {
        _initialized = await _recognizer.initialize(
          onStatus: (status) {
            if (status == 'done' || status == 'notListening') onEnded();
          },
          onError: (error) {
            Logger.debug(
                'SpeechService: recognizer error — ${error.errorMsg} (permanent: ${error.permanent})');
          },
        );
        if (!_initialized) {
          // No recognizer installed, or the platform refused to start one.
          return SpeechStartOutcome.unavailable;
        }
        _englishLocaleId = await _pickEnglishLocale();
      }

      await _recognizer.listen(
        onResult: (result) => onWords(result.recognizedWords, result.finalResult),
        listenOptions: stt.SpeechListenOptions(
          localeId: _englishLocaleId,
          listenMode: stt.ListenMode.dictation,
          partialResults: true,
          // A permanent error cancels the session rather than leaving the UI
          // stuck showing "listening" with a dead microphone.
          cancelOnError: true,
          listenFor: _listenFor,
          pauseFor: _pauseFor,
        ),
      );
      return SpeechStartOutcome.listening;
    } catch (e) {
      Logger.debug('SpeechService: start failed — $e');
      return SpeechStartOutcome.error;
    }
  }

  /// Ends the session and delivers the final transcript to [start]'s onWords.
  Future<void> stop() async {
    try {
      if (_recognizer.isListening) await _recognizer.stop();
    } catch (e) {
      Logger.debug('SpeechService: stop failed — $e');
    }
  }

  /// Ends the session and discards whatever was heard so far.
  Future<void> cancel() async {
    try {
      if (_recognizer.isListening) await _recognizer.cancel();
    } catch (e) {
      Logger.debug('SpeechService: cancel failed — $e');
    }
  }

  void dispose() {
    // Fire and forget: this runs from State.dispose, where nothing can await.
    _recognizer.cancel().catchError((Object e) {
      Logger.debug('SpeechService: cancel during dispose failed — $e');
    });
  }

  /// Prefers an Indian English recognizer — the product ships in India and
  /// en-US mistranscribes Indian English noticeably more often — then any
  /// English locale, then the device default (null) rather than refusing to
  /// work at all on a phone that has no English pack.
  Future<String?> _pickEnglishLocale() async {
    try {
      final locales = await _recognizer.locales();
      final english = locales
          .where((locale) => locale.localeId.toLowerCase().startsWith('en'))
          .toList();
      if (english.isEmpty) {
        Logger.debug(
            'SpeechService: no English recognizer installed — using device default');
        return null;
      }
      for (final locale in english) {
        if (locale.localeId.toLowerCase() == 'en_in') return locale.localeId;
      }
      return english.first.localeId;
    } catch (e) {
      Logger.debug('SpeechService: locale lookup failed — $e');
      return null;
    }
  }
}
