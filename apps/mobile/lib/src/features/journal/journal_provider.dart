import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/providers.dart';
import 'journal_entry.dart';

// ─── Form State ─────────────────────────────────────────────────

class JournalEntryFormState {
  final String? emotion;

  /// 0 means "not answered". The mood and its strength are optional — only 1–5
  /// is a real answer, and nothing is sent unless the client picked a dot.
  final int intensity;
  final String content;
  final bool isSaving;
  final String? error;
  final bool saved;

  /// The api's safety check found something in this entry and answered
  /// `showHelp: true`. The entry is already saved; the screen raises the help
  /// card before it leaves.
  final bool showHelp;

  const JournalEntryFormState({
    this.emotion,
    this.intensity = 0,
    this.content = '',
    this.isSaving = false,
    this.error,
    this.saved = false,
    this.showHelp = false,
  });

  const JournalEntryFormState.initial()
      : emotion = null,
        intensity = 0,
        content = '',
        isSaving = false,
        error = null,
        saved = false,
        showHelp = false;

  JournalEntryFormState copyWith({
    String? Function()? emotion,
    int? intensity,
    String? content,
    bool? isSaving,
    String? Function()? error,
    bool? saved,
    bool showHelp = false,
  }) {
    return JournalEntryFormState(
      emotion: emotion != null ? emotion() : this.emotion,
      intensity: intensity ?? this.intensity,
      content: content ?? this.content,
      isSaving: isSaving ?? this.isSaving,
      error: error != null ? error() : this.error,
      saved: saved ?? this.saved,
      showHelp: showHelp || this.showHelp,
    );
  }

  /// Writing is the point of a journal. A mood is a helper, never a gate: the
  /// Save button must come alive as soon as there is something to save.
  bool get isValid => content.trim().isNotEmpty;
}

class JournalEntryFormNotifier extends Notifier<JournalEntryFormState> {
  @override
  JournalEntryFormState build() {
    return const JournalEntryFormState.initial();
  }

  void setEmotion(String emotion) {
    state = state.copyWith(emotion: () => emotion);
  }

  /// Tapping the same mood twice clears it. A mood is optional, and a client
  /// who picked one by accident (or changed their mind on rereading the page)
  /// needs a way back to "no mood" that is discoverable — not a hidden gesture.
  /// Clearing the mood clears the strength with it: a strength with no feeling
  /// is not an answer, and the dots would otherwise stay filled under a chip
  /// that is no longer selected.
  void toggleEmotion(String emotion) {
    final clearing = state.emotion == emotion;
    state = state.copyWith(
      emotion: () => clearing ? null : emotion,
      intensity: clearing ? 0 : state.intensity,
    );
  }

  /// Clears mood and strength together (the "Clear" control next to the
  /// question). Writing stays untouched.
  void clearMood() {
    state = state.copyWith(emotion: () => null, intensity: 0);
  }

  void setIntensity(int intensity) {
    state = state.copyWith(intensity: intensity);
  }

  void setContent(String content) {
    state = state.copyWith(content: content);
  }

  void reset() {
    state = const JournalEntryFormState.initial();
  }

  Future<bool> save() async {
    if (!state.isValid) return false;

    state = state.copyWith(isSaving: true, error: () => null);

    try {
      final dio = ref.read(dioClientProvider);
      // Only send what the client actually answered. A blank mood stays
      // blank all the way to the database instead of being defaulted into
      // 'other' — a guess here would pollute every later reading of moods.
      final data = <String, dynamic>{'content': state.content.trim()};
      final emotion = state.emotion;
      if (emotion != null) {
        data['emotion'] = emotion;
        if (state.intensity > 0) data['intensity'] = state.intensity;
      }

      final response = await dio.post('/journal', data: data);

      if (response.statusCode != null &&
          response.statusCode! >= 200 &&
          response.statusCode! < 300) {
        // The api runs the same safety check chat runs, inside the write. Its
        // answer decides whether the help card is raised — the app does not
        // look at the words itself, and cannot skip the check by not looking.
        final safety = response.data is Map ? response.data['safety'] : null;
        final showHelpNow = safety is Map && safety['showHelp'] == true;
        state = state.copyWith(isSaving: false, saved: true, showHelp: showHelpNow);
        return true;
      } else {
        state = state.copyWith(
          isSaving: false,
          error: () => 'Failed to save entry. Please try again.',
        );
        return false;
      }
    } catch (e) {
      // Quote the server's own message when it sent one — "content must be a
      // non-empty string" tells the client what to do; "Network error" does
      // not, and only appears when the request genuinely never got an answer.
      String? serverMessage;
      if (e is DioException) {
        final data = e.response?.data;
        if (data is Map) {
          final error = data['error'];
          if (error is Map) {
            final message = error['message'];
            if (message is String && message.trim().isNotEmpty) {
              serverMessage = message;
            }
          }
        }
      }
      state = state.copyWith(
        isSaving: false,
        error: () => serverMessage ?? 'Network error. Please try again.',
      );
      return false;
    }
  }
}

final journalEntryFormProvider =
    NotifierProvider<JournalEntryFormNotifier, JournalEntryFormState>(
  JournalEntryFormNotifier.new,
);

// ─── Journal List ───────────────────────────────────────────────

final journalListProvider =
    FutureProvider.autoDispose<List<JournalEntry>>((ref) async {
  final dio = ref.read(dioClientProvider);
  final response = await dio.get('/journal');

  final entries = (response.data['entries'] as List)
      .map((e) => JournalEntry.fromJson(e as Map<String, dynamic>))
      .toList();

  return entries;
});
