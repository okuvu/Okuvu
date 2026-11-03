import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:okuvu/src/core/providers.dart';
import 'package:okuvu/src/features/journal/journal_entry.dart';
import 'package:okuvu/src/features/journal/journal_provider.dart';

void main() {
  group('JournalEntryFormNotifier', () {
    late ProviderContainer container;

    setUp(() {
      container = ProviderContainer();
    });

    tearDown(() {
      container.dispose();
    });

    test('initial state has null emotion, intensity 0, empty content',
        () {
      final state = container.read(journalEntryFormProvider);

      expect(state.emotion, isNull);
      // 0 = "not answered". Previously this started at 1, which recorded a
      // strength the client never chose and drew a filled first dot.
      expect(state.intensity, 0);
      expect(state.content, '');
      expect(state.isSaving, isFalse);
      expect(state.error, isNull);
      expect(state.saved, isFalse);
    });

    test('setEmotion updates emotion', () {
      container.read(journalEntryFormProvider.notifier).setEmotion('anxious');

      final state = container.read(journalEntryFormProvider);
      expect(state.emotion, 'anxious');
    });

    test('setIntensity updates intensity', () {
      container.read(journalEntryFormProvider.notifier).setIntensity(4);

      final state = container.read(journalEntryFormProvider);
      expect(state.intensity, 4);
    });

    // Row 6: the chips looked dead. Tapping the same mood twice is now a
    // deliberate second gesture — it clears the answer instead of being a
    // tap that does visibly nothing.
    test('toggleEmotion selects, then clears on a second tap', () {
      final notifier = container.read(journalEntryFormProvider.notifier);

      notifier.toggleEmotion('anxious');
      expect(container.read(journalEntryFormProvider).emotion, 'anxious');

      notifier.toggleEmotion('anxious');
      expect(container.read(journalEntryFormProvider).emotion, isNull);
    });

    test('toggleEmotion clears the strength along with the mood', () {
      final notifier = container.read(journalEntryFormProvider.notifier);

      notifier.toggleEmotion('sad');
      notifier.setIntensity(5);
      notifier.toggleEmotion('sad');

      final state = container.read(journalEntryFormProvider);
      expect(state.emotion, isNull);
      expect(state.intensity, 0);
    });

    test('toggleEmotion keeps the strength when switching mood', () {
      final notifier = container.read(journalEntryFormProvider.notifier);

      notifier.toggleEmotion('sad');
      notifier.setIntensity(3);
      notifier.toggleEmotion('calm');

      final state = container.read(journalEntryFormProvider);
      expect(state.emotion, 'calm');
      expect(state.intensity, 3);
    });

    test('clearMood leaves the writing alone', () {
      final notifier = container.read(journalEntryFormProvider.notifier);

      notifier.toggleEmotion('numb');
      notifier.setIntensity(2);
      notifier.setContent('Words I want to keep.');
      notifier.clearMood();

      final state = container.read(journalEntryFormProvider);
      expect(state.emotion, isNull);
      expect(state.intensity, 0);
      expect(state.content, 'Words I want to keep.');
    });

    test('setContent updates content', () {
      container
          .read(journalEntryFormProvider.notifier)
          .setContent('Feeling okay today.');

      final state = container.read(journalEntryFormProvider);
      expect(state.content, 'Feeling okay today.');
    });

    // The reported defect: Save never came alive without a mood. Writing is
    // the point of a journal, so words alone must be saveable.
    test('isValid is true with content and no mood at all', () {
      container
          .read(journalEntryFormProvider.notifier)
          .setContent('Some content');

      final state = container.read(journalEntryFormProvider);
      expect(state.isValid, isTrue);
    });

    test('isValid is true when content and a mood are both set', () {
      final notifier = container.read(journalEntryFormProvider.notifier);
      notifier.setEmotion('calm');
      notifier.setContent('Peaceful moment.');

      final state = container.read(journalEntryFormProvider);
      expect(state.isValid, isTrue);
    });

    test('isValid stays false when only a mood is picked', () {
      container.read(journalEntryFormProvider.notifier).setEmotion('sad');

      final state = container.read(journalEntryFormProvider);
      expect(state.isValid, isFalse);
    });

    test('isValid is false for whitespace-only content', () {
      container.read(journalEntryFormProvider.notifier).setContent('   ');

      final state = container.read(journalEntryFormProvider);
      expect(state.isValid, isFalse);
    });

    test('reset returns to initial state', () {
      final notifier = container.read(journalEntryFormProvider.notifier);
      notifier.setEmotion('angry');
      notifier.setIntensity(5);
      notifier.setContent('Very frustrated.');

      notifier.reset();

      final state = container.read(journalEntryFormProvider);
      expect(state.emotion, isNull);
      expect(state.intensity, 0);
      expect(state.content, '');
    });
  });

  group('JournalEntry', () {
    test('fromJson parses correctly', () {
      final json = {
        'id': 'entry-1',
        'emotion': 'hopeful',
        'intensity': 2,
        'content': 'Looking forward to tomorrow.',
        'created_at': '2026-07-25T22:30:00.000Z',
      };

      final entry = JournalEntry.fromJson(json);

      expect(entry.id, 'entry-1');
      expect(entry.emotion, 'hopeful');
      expect(entry.intensity, 2);
      expect(entry.content, 'Looking forward to tomorrow.');
      expect(entry.createdAt, DateTime.utc(2026, 7, 25, 22, 30, 0));
    });

    test('fromJson tolerates an entry with no mood recorded', () {
      // New shape: a client can save words without picking a feeling.
      final entry = JournalEntry.fromJson({
        'id': 'entry-2',
        'emotion': null,
        'intensity': null,
        'content': 'Just needed to write.',
        'created_at': '2026-11-03T08:00:00.000Z',
      });

      expect(entry.emotion, isNull);
      expect(entry.intensity, isNull);
      expect(entry.content, 'Just needed to write.');
    });

    test('fromJson tolerates the fields being absent entirely', () {
      final entry = JournalEntry.fromJson({
        'id': 'entry-3',
        'content': 'Older server payload.',
        'created_at': '2026-11-03T08:00:00.000Z',
      });

      expect(entry.emotion, isNull);
      expect(entry.intensity, isNull);
    });
  });

  group('journalEmotions constants', () {
    test('has exactly 8 emotions', () {
      expect(journalEmotions, hasLength(8));
    });

    test('emotionLabels has a label for every emotion', () {
      for (final emotion in journalEmotions) {
        expect(journalEmotionLabels, contains(emotion));
      }
    });
  });
}
