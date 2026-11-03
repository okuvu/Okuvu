import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

/// Serves the next journal writing prompt.
///
/// Why this exists as its own object: the previous version of the "Get a
/// prompt" button spent a live model call per tap inside the app's 10-second
/// receive timeout, and swallowed every failure — so when the answer was slow
/// or the call failed, the button looked dead and nothing appeared. The
/// prompts are now a fixed, reviewable library on the server
/// (apps/api/src/agents/journal-prompt/prompt-library.ts), which answers in
/// one cheap read. This class fetches that list once per mood, keeps it for
/// the session, hands out prompts without repeating the last one, and falls
/// back to a small built-in set if the phone is offline — a tap always
/// produces a prompt.
class JournalPromptService {
  JournalPromptService(this._dio);

  final Dio _dio;
  final _random = Random();

  /// Fetched pools, keyed by mood ('' for "no mood picked").
  final Map<String, List<String>> _pools = {};

  String? _lastServed;

  /// Last-resort set, used only when the server cannot be reached. Mirrors the
  /// general ('any') group of the server library — the app must show something
  /// real rather than nothing, and these sentences are the ones already
  /// written for exactly that case. Keep in step with
  /// apps/api/src/agents/journal-prompt/prompt-library.ts.
  static const List<String> offlineFloor = [
    "What's one thing that stood out to you today, good or bad?",
    'Write about a moment today when you felt most like yourself.',
    "What's something you're carrying right now that you haven't said out loud?",
    'Describe how your body feels right now, without judging it.',
    "What's one small thing that helped, even a little, this week?",
    'If today had a colour, what would it be — and why?',
    "What's something you needed to hear today?",
    'Write a few lines to your future self about how today went.',
  ];

  /// Returns a prompt, never null: server pool first, built-in set if the
  /// request fails or comes back empty.
  Future<String> next({String? emotion}) async {
    final pool = await _poolFor(emotion);
    return _pick(pool.isEmpty ? offlineFloor : pool);
  }

  Future<List<String>> _poolFor(String? emotion) async {
    final key = emotion ?? '';
    final cached = _pools[key];
    if (cached != null && cached.isNotEmpty) return cached;

    try {
      final response = await _dio.get(
        '/journal/prompts',
        queryParameters: emotion == null ? null : {'emotion': emotion},
        // Shorter than the client-wide timeout: a prompt is a small read, and
        // waiting 10s behind a spinner is worse than the built-in set.
        options: Options(receiveTimeout: const Duration(seconds: 6)),
      );

      final data = response.data;
      final raw = data is Map ? data['prompts'] : null;
      if (raw is List) {
        final texts = raw
            .whereType<Map>()
            .map((p) => p['text'])
            .whereType<String>()
            .map((t) => t.trim())
            .where((t) => t.isNotEmpty)
            .toList();
        if (texts.isNotEmpty) {
          _pools[key] = texts;
          return texts;
        }
      }
    } catch (_) {
      // Deliberately silent: the caller still gets a prompt from the built-in
      // set, so there is nothing for the client to act on. A message here
      // would be an error notice wrapped around a working button.
    }
    return const [];
  }

  String _pick(List<String> pool) {
    if (pool.length == 1) {
      _lastServed = pool.first;
      return pool.first;
    }
    var choice = pool[_random.nextInt(pool.length)];
    // Don't serve the same sentence twice in a row while there is an
    // alternative — two taps that answer identically read as a dead button.
    var guard = 0;
    while (choice == _lastServed && guard < 5) {
      choice = pool[_random.nextInt(pool.length)];
      guard++;
    }
    _lastServed = choice;
    return choice;
  }
}

final journalPromptServiceProvider = Provider<JournalPromptService>((ref) {
  return JournalPromptService(ref.read(dioClientProvider));
});
