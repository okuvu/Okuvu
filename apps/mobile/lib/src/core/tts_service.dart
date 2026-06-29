import 'package:flutter_tts/flutter_tts.dart';
import 'package:flutter/foundation.dart';

class TtsService {
  final FlutterTts _tts = FlutterTts();
  bool _voiceEnabled = false;

  bool get voiceEnabled => _voiceEnabled;

  TtsService() {
    _tts.setErrorHandler((msg) {
      debugPrint('TtsService: engine error — $msg');
    });
  }

  Future<void> setVoiceEnabled(bool value) async {
    _voiceEnabled = value;
    if (!value) {
      try {
        await _tts.stop();
      } catch (e) {
        debugPrint('TtsService: stop failed during voice disable — $e');
      }
    }
  }

  Future<void> speak(String text) async {
    if (!_voiceEnabled) return;

    final available = await isLanguageAvailable();
    if (!available) {
      debugPrint('TtsService: en-US language pack not available — silent fallback');
      return;
    }

    try {
      await _tts.stop();
      await _tts.speak(text);
    } catch (e) {
      debugPrint('TtsService: speak failed — $e');
    }
  }

  Future<void> stop() async {
    try {
      await _tts.stop();
    } catch (e) {
      debugPrint('TtsService: stop failed — $e');
    }
  }

  Future<bool> isLanguageAvailable() async {
    try {
      final result = await _tts.isLanguageAvailable('en-US');
      return result == true;
    } catch (e) {
      debugPrint('TtsService: isLanguageAvailable check failed — $e');
      return false;
    }
  }

  void dispose() {
    _tts.stop();
  }
}
