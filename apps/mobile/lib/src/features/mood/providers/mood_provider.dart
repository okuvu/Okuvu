import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../progress/providers/progress_provider.dart';
import '../models/mood_entry.dart';

/// The client's own check-ins, newest first.
///
/// 30 days so the list under the form and the "Your week" card can both read the
/// same fetch: the card counts the last seven, the list shows the rest.
final moodEntriesProvider = FutureProvider.autoDispose<List<MoodEntry>>((ref) async {
  final dio = ref.read(dioClientProvider);
  final response = await dio.get(
    '/progress/mood',
    queryParameters: {'days': 30},
  );

  final data = response.data;
  final List<dynamic> items = data is Map<String, dynamic>
      ? (data['entries'] as List<dynamic>? ?? [])
      : (data is List ? data : const []);

  final entries = items
      .whereType<Map<String, dynamic>>()
      .map(MoodEntry.fromJson)
      .toList();

  // The api answers oldest first (the Progress chart reads it that way); the
  // list is read newest first.
  return entries.reversed.toList(growable: false);
});

/// What the api answered after a save.
///
/// `showHelp` is the crisis card, and only the api can raise it: the "Something
/// else" box is screened in the write path. `helpOffer` is the gentle offer for
/// a check that could not run. Neither is caused by tapping "hopeless" or
/// "numb" — that pair shows the local card and nothing else.
class MoodSaveOutcome {
  const MoodSaveOutcome({
    required this.ok,
    this.id,
    this.showHelp = false,
    this.helpOffer = false,
  });

  final bool ok;
  final String? id;
  final bool showHelp;
  final bool helpOffer;
}

/// Saves one check-in: the face, the words, the strength, and the date the api
/// stamps (the client's IST day).
class MoodCheckinNotifier extends Notifier<void> {
  @override
  void build() {}

  Future<MoodSaveOutcome> save({
    required int mood,
    /// `null` means "leave the words alone" (the home card's quick tap);
    /// an empty list means "the client cleared them" and is written as such.
    List<String>? words,
    String? other,
    int? strength,
  }) async {
    final dio = ref.read(dioClientProvider);

    // Only what the client actually answered. A blank box stays blank all the
    // way to the database instead of being defaulted into a value nobody chose.
    final data = <String, dynamic>{'mood_value': mood};
    if (words != null) data['feeling_words'] = words;
    if (other != null && other.trim().isNotEmpty) {
      data['feeling_other'] = other.trim();
    }
    if (strength != null) data['strength_1_5'] = strength;

    try {
      final response = await dio.post<Map<String, dynamic>>(
        '/progress/mood/checkin',
        data: data,
      );
      ref.invalidate(moodEntriesProvider);
      ref.invalidate(moodProgressProvider);
      ref.read(becomingJourneyProvider.notifier).recordMoment();

      final safety = response.data?['safety'];
      return MoodSaveOutcome(
        ok: true,
        id: response.data?['id'] as String?,
        showHelp: safety is Map && safety['showHelp'] == true,
        helpOffer: safety is Map && safety['helpOffer'] == true,
      );
    } catch (_) {
      return const MoodSaveOutcome(ok: false);
    }
  }
}

final moodCheckinProvider = NotifierProvider<MoodCheckinNotifier, void>(
  MoodCheckinNotifier.new,
);
