import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:evia/src/core/providers.dart';
import 'package:evia/src/features/journal/journal_entry.dart';
import 'package:evia/src/features/journal/journal_provider.dart';

void main() {
  group('JournalEntryFormNotifier', () {
    late ProviderContainer container;

    setUp(() {
      container = ProviderContainer();
    });

    tearDown(() {
      container.dispose();
    });

    test('initial state has null emotion, intensity 1, empty content',
        () {
      final state = container.read(journalEntryFormProvider);

      expect(state.emotion, isNull);
      expect(state.intensity, 1);
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

    test('setContent updates content', () {
      container
          .read(journalEntryFormProvider.notifier)
          .setContent('Feeling okay today.');

      final state = container.read(journalEntryFormProvider);
      expect(state.content, 'Feeling okay today.');
    });

    test('isValid is false when emotion is null', () {
      container
          .read(journalEntryFormProvider.notifier)
          .setContent('Some content');

      final state = container.read(journalEntryFormProvider);
      expect(state.isValid, isFalse);
    });

    test('isValid is false when content is empty', () {
      container.read(journalEntryFormProvider.notifier).setEmotion('sad');

      final state = container.read(journalEntryFormProvider);
      expect(state.isValid, isFalse);
    });

    test('isValid is true when both emotion and content are set', () {
      final notifier = container.read(journalEntryFormProvider.notifier);
      notifier.setEmotion('calm');
      notifier.setContent('Peaceful moment.');

      final state = container.read(journalEntryFormProvider);
      expect(state.isValid, isTrue);
    });

    test('reset returns to initial state', () {
      final notifier = container.read(journalEntryFormProvider.notifier);
      notifier.setEmotion('angry');
      notifier.setIntensity(5);
      notifier.setContent('Very frustrated.');

      notifier.reset();

      final state = container.read(journalEntryFormProvider);
      expect(state.emotion, isNull);
      expect(state.intensity, 1);
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
