import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/providers.dart';
import 'journal_entry.dart';

// ─── Form State ─────────────────────────────────────────────────

class JournalEntryFormState {
  final String? emotion;
  final int intensity;
  final String content;
  final bool isSaving;
  final String? error;
  final bool saved;

  const JournalEntryFormState({
    this.emotion,
    this.intensity = 1,
    this.content = '',
    this.isSaving = false,
    this.error,
    this.saved = false,
  });

  const JournalEntryFormState.initial()
      : emotion = null,
        intensity = 1,
        content = '',
        isSaving = false,
        error = null,
        saved = false;

  JournalEntryFormState copyWith({
    String? Function()? emotion,
    int? intensity,
    String? content,
    bool? isSaving,
    String? Function()? error,
    bool? saved,
  }) {
    return JournalEntryFormState(
      emotion: emotion != null ? emotion() : this.emotion,
      intensity: intensity ?? this.intensity,
      content: content ?? this.content,
      isSaving: isSaving ?? this.isSaving,
      error: error != null ? error() : this.error,
      saved: saved ?? this.saved,
    );
  }

  bool get isValid => emotion != null && content.trim().isNotEmpty;
}

class JournalEntryFormNotifier extends Notifier<JournalEntryFormState> {
  @override
  JournalEntryFormState build() {
    return const JournalEntryFormState.initial();
  }

  void setEmotion(String emotion) {
    state = state.copyWith(emotion: () => emotion);
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
      final response = await dio.post(
        '/journal',
        data: {
          'emotion': state.emotion,
          'intensity': state.intensity,
          'content': state.content.trim(),
        },
      );

      if (response.statusCode != null &&
          response.statusCode! >= 200 &&
          response.statusCode! < 300) {
        state = state.copyWith(isSaving: false, saved: true);
        return true;
      } else {
        state = state.copyWith(
          isSaving: false,
          error: () => 'Failed to save entry. Please try again.',
        );
        return false;
      }
    } catch (e) {
      state = state.copyWith(
        isSaving: false,
        error: () => 'Network error. Please try again.',
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
