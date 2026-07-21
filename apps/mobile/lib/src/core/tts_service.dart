import 'package:flutter_tts/flutter_tts.dart';
import 'logger.dart';

class TtsService {
  final FlutterTts _tts = FlutterTts();
  bool _voiceEnabled = false;

  bool get voiceEnabled => _voiceEnabled;

  TtsService() {
    _tts.setErrorHandler((msg) {
      Logger.debug('TtsService: engine error — $msg');
    });
  }

  Future<void> setVoiceEnabled(bool value) async {
    _voiceEnabled = value;
    if (!value) {
      try {
        await _tts.stop();
      } catch (e) {
        Logger.debug('TtsService: stop failed during voice disable — $e');
      }
    }
  }

  Future<void> speak(String text) async {
    if (!_voiceEnabled) return;

    final available = await isLanguageAvailable();
    if (!available) {
      Logger.debug('TtsService: en-US language pack not available — silent fallback');
      return;
    }

    try {
      await _tts.stop();
      await _tts.speak(text);
    } catch (e) {
      Logger.debug('TtsService: speak failed — $e');
    }
  }

  Future<void> stop() async {
    try {
      await _tts.stop();
    } catch (e) {
      Logger.debug('TtsService: stop failed — $e');
    }
  }

  Future<bool> isLanguageAvailable() async {
    try {
      final result = await _tts.isLanguageAvailable('en-US');
      return result == true;
    } catch (e) {
      Logger.debug('TtsService: isLanguageAvailable check failed — $e');
      return false;
    }
  }

  void dispose() {
    _tts.stop();
  }
}
